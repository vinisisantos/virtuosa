import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || "http://localhost:8080";
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || "";
const CALL_BLOCK_SETTINGS_KEY = "whatsapp_call_block_settings";
const DEFAULT_MESSAGE =
  "Este número não recebe ligações. Por favor, envie sua mensagem por aqui para darmos continuidade ao atendimento.";
const ALLOWED_UNITS = ["Osasco", "SBC", "SCS"];
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
    const units = Array.isArray(parsed?.units)
      ? parsed.units.filter((unit: string) => ALLOWED_UNITS.includes(unit))
      : ALLOWED_UNITS;

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

function sameUnits(a: string[], b: string[]) {
  return a.length === b.length && a.every((unit) => b.includes(unit));
}

function shouldSyncInstances(previous: CallBlockSettings, next: CallBlockSettings) {
  return previous.enabled || next.enabled || !sameUnits(previous.units, next.units);
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

  for (const instance of instances) {
    const instanceUnit = instance.unit || "";
    const shouldRejectCalls = settings.enabled && settings.units.includes(instanceUnit);

    try {
      const settingsRes = await fetch(`${EVOLUTION_API_URL}/settings/set/${instance.name}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: EVOLUTION_API_KEY,
        },
        body: JSON.stringify({
          rejectCall: shouldRejectCalls,
          msgCall: shouldRejectCalls ? settings.message : "",
        }),
      });

      if (settingsRes.ok) synced += 1;
      else failed += 1;
    } catch {
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

      if (webhookRes.ok) webhookSynced += 1;
      else webhookFailed += 1;
    } catch {
      webhookFailed += 1;
    }
  }

  return { synced, failed, webhookSynced, webhookFailed };
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
    const webhookSync = shouldSyncInstances(previousSettings, settings)
      ? await syncWebhookForInstances(req, settings, previousSettings)
      : {
          synced: 0,
          failed: 0,
          skipped: true,
          reason: "Webhook já estava configurado; alteração não exige sincronização",
        };

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
