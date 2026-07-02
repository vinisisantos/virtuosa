import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || "http://localhost:8080";
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || "";
const CALL_BLOCK_SETTINGS_KEY = "whatsapp_call_block_settings";
const DEFAULT_MESSAGE =
  "Este número não recebe ligações. Por favor, envie sua mensagem por aqui para darmos continuidade ao atendimento.";
const ALLOWED_UNITS = ["Osasco", "SBC", "SCS", "Todas"];
const LEGACY_DEFAULT_UNITS = ["Osasco", "SBC", "SCS"];
const WEBHOOK_EVENTS = [
  "MESSAGES_UPSERT",
  "MESSAGES_UPDATE",
  "CONNECTION_UPDATE",
  "QRCODE_UPDATED",
  "CALL",
];

type CallBlockSettings = {
  enabled: boolean;
  message: string;
  cooldownMinutes: number;
  units: string[];
};

type WebhookSyncResult = {
  synced: number;
  failed: number;
  webhookSynced?: number;
  webhookFailed?: number;
  skipped?: boolean;
  reason?: string;
  details?: Array<{
    instance: string;
    unit?: string | null;
    rejectCall: boolean;
    settingsOk: boolean;
    settingsPath?: string;
    settingsStatus?: number;
    settingsError?: string;
    webhookOk?: boolean;
    webhookStatus?: number;
    webhookError?: string;
  }>;
};

function normalizeSettings(value?: string | null): CallBlockSettings {
  if (!value) {
    return {
      enabled: false,
      message: DEFAULT_MESSAGE,
      cooldownMinutes: 30,
      units: ALLOWED_UNITS,
    };
  }

  try {
    const parsed = JSON.parse(value);
    let units = Array.isArray(parsed?.units)
      ? parsed.units.filter((unit: string) => ALLOWED_UNITS.includes(unit))
      : ALLOWED_UNITS;
    const wasLegacyDefault =
      units.length === LEGACY_DEFAULT_UNITS.length &&
      LEGACY_DEFAULT_UNITS.every((unit) => units.includes(unit));
    if (wasLegacyDefault) units = ALLOWED_UNITS;

    return {
      enabled: parsed?.enabled === true,
      message:
        typeof parsed?.message === "string" && parsed.message.trim()
          ? parsed.message.trim().slice(0, 500)
          : DEFAULT_MESSAGE,
      cooldownMinutes:
        typeof parsed?.cooldownMinutes === "number" && Number.isFinite(parsed.cooldownMinutes)
          ? Math.min(Math.max(Math.round(parsed.cooldownMinutes), 1), 1440)
          : 30,
      units: units.length ? units : ALLOWED_UNITS,
    };
  } catch {
    return {
      enabled: false,
      message: DEFAULT_MESSAGE,
      cooldownMinutes: 30,
      units: ALLOWED_UNITS,
    };
  }
}

function isDatabaseConnectionError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  return /max client connections|too many connections|can't reach database|connection/i.test(message);
}

function friendlyDatabaseError() {
  return "O banco atingiu o limite de conexões no momento. Aguarde alguns instantes e tente novamente.";
}

async function getSettings() {
  const setting = await prisma.appSetting.findUnique({
    where: { key: CALL_BLOCK_SETTINGS_KEY },
    select: { value: true },
  });
  return normalizeSettings(setting?.value);
}

async function saveSettings(settings: CallBlockSettings) {
  await prisma.appSetting.upsert({
    where: { key: CALL_BLOCK_SETTINGS_KEY },
    create: {
      key: CALL_BLOCK_SETTINGS_KEY,
      value: JSON.stringify(settings),
    },
    update: {
      value: JSON.stringify(settings),
    },
  });
}

/**
 * Evolution API v2 valida o corpo completo em /settings/set — enviar só
 * rejectCall/msgCall retorna 400. Busca as settings atuais para reenviar
 * o corpo inteiro preservando o que já estava configurado.
 */
async function fetchCurrentEvolutionSettings(instanceName: string): Promise<Record<string, unknown>> {
  try {
    const res = await fetch(`${EVOLUTION_API_URL}/settings/find/${instanceName}`, {
      headers: { apikey: EVOLUTION_API_KEY },
    });
    if (!res.ok) return {};
    const data = await res.json().catch(() => ({}));
    const settings = data?.settings ?? data;
    return settings && typeof settings === "object" ? settings : {};
  } catch {
    return {};
  }
}

function buildFullSettingsBody(current: Record<string, unknown>, rejectCall: boolean, msgCall: string) {
  return {
    rejectCall,
    msgCall,
    groupsIgnore: current.groupsIgnore === true,
    alwaysOnline: current.alwaysOnline === true,
    readMessages: current.readMessages === true,
    readStatus: current.readStatus === true,
    syncFullHistory: current.syncFullHistory === true,
  };
}

async function syncWebhookForInstances(
  req: Request,
  settings: CallBlockSettings,
  previousSettings?: CallBlockSettings,
): Promise<WebhookSyncResult> {
  const host = req.headers.get("host");
  if (!host || !EVOLUTION_API_KEY) {
    return { synced: 0, failed: 0, skipped: true, reason: "Configuração da Evolution indisponível" };
  }

  const protocol = host.includes("localhost") ? "http" : "https";
  const webhookUrl = `${protocol}://${host}/api/whatsapp/webhook`;
  const targetUnits = Array.from(new Set([...(previousSettings?.units || []), ...settings.units]));
  const instances = await prisma.whatsAppInstance.findMany({
    where: {
      status: { not: "archived" },
      ...(targetUnits.length ? { unit: { in: targetUnits } } : {}),
    },
    select: { name: true, unit: true },
  });

  if (instances.length === 0) {
    return { synced: 0, failed: 0, skipped: true, reason: "Nenhuma instância para atualizar" };
  }

  let synced = 0;
  let failed = 0;
  let webhookSynced = 0;
  let webhookFailed = 0;
  const details: NonNullable<WebhookSyncResult["details"]> = [];

  for (const instance of instances) {
    const instanceUnit = instance.unit || "";
    const shouldRejectCalls = settings.enabled && settings.units.includes(instanceUnit);
    const detail: NonNullable<WebhookSyncResult["details"]>[number] = {
      instance: instance.name,
      unit: instance.unit,
      rejectCall: shouldRejectCalls,
      settingsOk: false,
    };
    details.push(detail);

    const currentSettings = await fetchCurrentEvolutionSettings(instance.name);
    const fullBody = buildFullSettingsBody(
      currentSettings,
      shouldRejectCalls,
      shouldRejectCalls ? settings.message : "",
    );
    const settingsBodies = [
      fullBody,
      { settings: fullBody },
      { rejectCall: shouldRejectCalls, msgCall: shouldRejectCalls ? settings.message : "" },
      { reject_call: shouldRejectCalls, msg_call: shouldRejectCalls ? settings.message : "" },
    ];
    const settingsMethods = ["POST", "PUT", "PATCH"];
    const settingsPaths = [
      `/settings/set/${instance.name}`,
      `/settings/update/${instance.name}`,
      `/settings/${instance.name}`,
      `/instance/settings/${instance.name}`,
      `/instance/setSettings/${instance.name}`,
      `/instance/updateSettings/${instance.name}`,
    ];
    let lastSettingsError = "";
    const settingsErrors: string[] = [];

    settingsLoop:
    for (const path of settingsPaths) {
      for (const method of settingsMethods) {
        for (const body of settingsBodies) {
          try {
            const settingsRes = await fetch(`${EVOLUTION_API_URL}${path}`, {
              method,
              headers: {
                "Content-Type": "application/json",
                apikey: EVOLUTION_API_KEY,
              },
              body: JSON.stringify(body),
            });
            const responseText = await settingsRes.text().catch(() => "");
            if (settingsRes.ok) {
              detail.settingsOk = true;
              detail.settingsPath = `${method} ${path}`;
              detail.settingsStatus = settingsRes.status;
              synced += 1;
              break settingsLoop;
            }
            lastSettingsError = `${method} ${path} -> ${settingsRes.status}: ${responseText.slice(0, 220)}`;
            settingsErrors.push(lastSettingsError);
            detail.settingsStatus = settingsRes.status;
          } catch (error) {
            lastSettingsError = `${method} ${path} -> ${
              error instanceof Error ? error.message : String(error)
            }`;
            settingsErrors.push(lastSettingsError);
          }
        }
      }
    }

    if (!detail.settingsOk) {
      detail.settingsError =
        settingsErrors.slice(-6).join(" | ") || lastSettingsError || "Evolution não aceitou settings";
      failed += 1;
    }

    if (!shouldRejectCalls) continue;

    try {
      const webhookRes = await fetch(`${EVOLUTION_API_URL}/webhook/set/${instance.name}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: EVOLUTION_API_KEY,
        },
        body: JSON.stringify({
          webhook: {
            enabled: true,
            url: webhookUrl,
            webhookByEvents: false,
            webhookBase64: true,
            events: WEBHOOK_EVENTS,
          },
        }),
      });

      detail.webhookStatus = webhookRes.status;
      if (webhookRes.ok) {
        detail.webhookOk = true;
        webhookSynced += 1;
      } else {
        detail.webhookOk = false;
        detail.webhookError = (await webhookRes.text().catch(() => "")).slice(0, 350);
        webhookFailed += 1;
      }
    } catch (error) {
      detail.webhookOk = false;
      detail.webhookError = error instanceof Error ? error.message : String(error);
      webhookFailed += 1;
    }
  }

  return { synced, failed, webhookSynced, webhookFailed, details };
}

export async function GET(req: Request) {
  const role = req.headers.get("x-user-role");
  if (role !== "ADMINISTRADOR") {
    return NextResponse.json({ error: "Acesso restrito a administradores" }, { status: 403 });
  }

  try {
    const settings = await getSettings();
    return NextResponse.json({ settings });
  } catch (error) {
    console.error("[WhatsApp Call Block Settings GET]", error);
    return NextResponse.json(
      {
        error: isDatabaseConnectionError(error)
          ? friendlyDatabaseError()
          : "Erro ao carregar configuração de bloqueio de ligações",
      },
      { status: 503 },
    );
  }
}

export async function PUT(req: Request) {
  const role = req.headers.get("x-user-role");
  if (role !== "ADMINISTRADOR") {
    return NextResponse.json({ error: "Acesso restrito a administradores" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const previousSettings = await getSettings();
    const rawUnits = Array.isArray(body?.units) ? body.units : ALLOWED_UNITS;
    const units = rawUnits.filter((unit: string) => ALLOWED_UNITS.includes(unit));
    const settings: CallBlockSettings = {
      enabled: body?.enabled === true,
      message:
        typeof body?.message === "string" && body.message.trim()
          ? body.message.trim().slice(0, 500)
          : DEFAULT_MESSAGE,
      cooldownMinutes:
        typeof body?.cooldownMinutes === "number" && Number.isFinite(body.cooldownMinutes)
          ? Math.min(Math.max(Math.round(body.cooldownMinutes), 1), 1440)
          : 30,
      units: units.length ? units : ALLOWED_UNITS,
    };

    await saveSettings(settings);
    const webhookSync = await syncWebhookForInstances(req, settings, previousSettings);

    return NextResponse.json({ success: true, settings, webhookSync });
  } catch (error: any) {
    console.error("[WhatsApp Call Block Settings]", error);
    return NextResponse.json(
      {
        error: isDatabaseConnectionError(error)
          ? friendlyDatabaseError()
          : "Erro ao salvar configuração de bloqueio de ligações",
      },
      { status: isDatabaseConnectionError(error) ? 503 : 500 },
    );
  }
}
