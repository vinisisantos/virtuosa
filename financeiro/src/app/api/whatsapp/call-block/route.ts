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
  "CALLS_UPSERT",
  "CALL_UPDATE",
  "CALLS_UPDATE",
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

function shouldSyncWebhooks(previous: CallBlockSettings, next: CallBlockSettings) {
  if (!next.enabled) return false;
  return previous.enabled !== next.enabled || !sameUnits(previous.units, next.units);
}

async function syncWebhookForInstances(req: Request, settings: CallBlockSettings): Promise<WebhookSyncResult> {
  const host = req.headers.get("host");
  if (!host || !EVOLUTION_API_KEY) {
    return { synced: 0, failed: 0, skipped: true, reason: "Configuração da Evolution indisponível" };
  }

  const protocol = host.includes("localhost") ? "http" : "https";
  const webhookUrl = `${protocol}://${host}/api/whatsapp/webhook`;
  const instances = await prisma.whatsAppInstance.findMany({
    where: {
      status: "connected",
      ...(settings.units.length ? { unit: { in: settings.units } } : {}),
    },
    select: { name: true },
  });

  if (instances.length === 0) {
    return { synced: 0, failed: 0, skipped: true, reason: "Nenhuma instância conectada para atualizar" };
  }

  let synced = 0;
  let failed = 0;

  for (const instance of instances) {
    try {
      const res = await fetch(`${EVOLUTION_API_URL}/webhook/set/${instance.name}`, {
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

      if (res.ok) synced += 1;
      else failed += 1;
    } catch {
      failed += 1;
    }
  }

  return { synced, failed };
}

export async function GET(req: Request) {
  const role = req.headers.get("x-user-role");
  if (role !== "ADMINISTRADOR") {
    return NextResponse.json({ error: "Acesso restrito a administradores" }, { status: 403 });
  }

  const settings = await getSettings();
  return NextResponse.json({ settings });
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
    const webhookSync = shouldSyncWebhooks(previousSettings, settings)
      ? await syncWebhookForInstances(req, settings)
      : {
          synced: 0,
          failed: 0,
          skipped: true,
          reason: "Webhook já estava configurado; alteração não exige sincronização",
        };

    return NextResponse.json({ success: true, settings, webhookSync });
  } catch (error: any) {
    console.error("[WhatsApp Call Block Settings]", error);
    return NextResponse.json({ error: error?.message || "Erro ao salvar configuração" }, { status: 500 });
  }
}
