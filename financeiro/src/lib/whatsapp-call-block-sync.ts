import { prisma } from "@/lib/db";

/**
 * Auto-aplicação da rejeição de chamadas (rejectCall/msgCall) na Evolution API.
 *
 * O desligamento automático de ligações SÓ acontece via configuração nativa da
 * instância na Evolution (Baileys) — não existe endpoint para rejeitar uma
 * chamada em andamento. Este módulo garante que a configuração esteja aplicada,
 * re-tentando periodicamente a partir de qualquer evento de webhook, e grava o
 * resultado (status HTTP, corpo de erro e verificação via /settings/find) em
 * AppSetting para diagnóstico sem acesso direto ao servidor da Evolution.
 */

const CALL_BLOCK_SETTINGS_KEY = "whatsapp_call_block_settings";
const SYNC_STATE_KEY = "whatsapp_call_block_sync_state";
const RETRY_OK_MS = 60 * 60_000;      // reconfirma a cada 1h quando ok
const RETRY_FAIL_MS = 10 * 60_000;    // re-tenta a cada 10min quando falhou
const DEFAULT_MESSAGE =
  "Este número não recebe ligações. Por favor, envie sua mensagem por aqui para darmos continuidade ao atendimento.";
const ALLOWED_UNITS = ["Osasco", "SBC", "SCS", "Todas"];

const getEvolutionConfig = () => ({
  url: process.env.EVOLUTION_API_URL || "http://localhost:8080",
  apiKey: process.env.EVOLUTION_API_KEY || "",
});

type SyncEntry = {
  at: number;
  ok: boolean;
  settingsHash: string;
  httpStatus?: number;
  error?: string;
  verified?: { rejectCall?: unknown; msgCall?: unknown };
  serverVersion?: string;
};

async function getCallBlockConfig() {
  const setting = await prisma.appSetting.findUnique({
    where: { key: CALL_BLOCK_SETTINGS_KEY },
    select: { value: true },
  });
  let enabled = false;
  let message = DEFAULT_MESSAGE;
  let units: string[] = ALLOWED_UNITS;
  try {
    const parsed = setting?.value ? JSON.parse(setting.value) : null;
    if (parsed) {
      enabled = parsed.enabled === true;
      if (typeof parsed.message === "string" && parsed.message.trim()) message = parsed.message.trim();
      if (Array.isArray(parsed.units)) {
        const filtered = parsed.units.filter((u: string) => ALLOWED_UNITS.includes(u));
        if (filtered.length) units = filtered;
      }
    }
  } catch {}
  return { enabled, message, units };
}

async function readSyncState(): Promise<Record<string, SyncEntry>> {
  try {
    const setting = await prisma.appSetting.findUnique({
      where: { key: SYNC_STATE_KEY },
      select: { value: true },
    });
    const parsed = setting?.value ? JSON.parse(setting.value) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function writeSyncState(state: Record<string, SyncEntry>) {
  await prisma.appSetting.upsert({
    where: { key: SYNC_STATE_KEY },
    create: { key: SYNC_STATE_KEY, value: JSON.stringify(state) },
    update: { value: JSON.stringify(state) },
  });
}

/**
 * Garante rejectCall/msgCall aplicados na instância. Throttled: roda de novo
 * só depois do intervalo, ou imediatamente quando a configuração muda.
 * Nunca lança — feita para fire-and-forget a partir do webhook.
 */
export async function ensureCallRejectApplied(instance: { name: string; unit?: string | null }) {
  try {
    const { url, apiKey } = getEvolutionConfig();
    if (!apiKey) return;

    const config = await getCallBlockConfig();
    const unit = instance.unit || "Todas";
    const shouldReject = config.enabled && config.units.includes(unit);
    const settingsHash = JSON.stringify([shouldReject, config.message]);

    const state = await readSyncState();
    const entry = state[instance.name];
    const now = Date.now();
    if (entry && entry.settingsHash === settingsHash) {
      const interval = entry.ok ? RETRY_OK_MS : RETRY_FAIL_MS;
      if (now - entry.at < interval) return;
    }

    // Settings atuais para reenviar o corpo COMPLETO (Evolution v2 valida tudo)
    let current: Record<string, unknown> = {};
    try {
      const findRes = await fetch(`${url}/settings/find/${instance.name}`, {
        headers: { apikey: apiKey },
      });
      if (findRes.ok) {
        const data = await findRes.json().catch(() => ({}));
        const found = data?.settings ?? data;
        if (found && typeof found === "object") current = found;
      }
    } catch {}

    const body = {
      rejectCall: shouldReject,
      msgCall: shouldReject ? config.message : "",
      groupsIgnore: current.groupsIgnore === true,
      alwaysOnline: current.alwaysOnline === true,
      readMessages: current.readMessages === true,
      readStatus: current.readStatus === true,
      syncFullHistory: current.syncFullHistory === true,
    };

    const result: SyncEntry = { at: now, ok: false, settingsHash };

    // Versão do servidor Evolution (endpoint raiz, sem auth) — orienta upgrade
    try {
      const rootRes = await fetch(url, { headers: { apikey: apiKey } });
      if (rootRes.ok) {
        const info = await rootRes.json().catch(() => ({}));
        if (info?.version) result.serverVersion = String(info.version);
      }
    } catch {}

    try {
      const res = await fetch(`${url}/settings/set/${instance.name}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: apiKey },
        body: JSON.stringify(body),
      });
      result.httpStatus = res.status;
      if (!res.ok) {
        result.error = (await res.text().catch(() => "")).slice(0, 400);
      } else {
        // Verificação: lê de volta o que a Evolution efetivamente gravou
        try {
          const verifyRes = await fetch(`${url}/settings/find/${instance.name}`, {
            headers: { apikey: apiKey },
          });
          if (verifyRes.ok) {
            const data = await verifyRes.json().catch(() => ({}));
            const found = data?.settings ?? data ?? {};
            result.verified = { rejectCall: found.rejectCall, msgCall: found.msgCall };
            result.ok = found.rejectCall === shouldReject;
            if (!result.ok) result.error = "Evolution aceitou o set mas o find não reflete o valor";
          } else {
            result.ok = true; // set ok, verificação indisponível
          }
        } catch {
          result.ok = true;
        }
      }
    } catch (error: any) {
      result.error = (error?.message || String(error)).slice(0, 400);
    }

    state[instance.name] = result;
    await writeSyncState(state);
  } catch (error) {
    console.warn("[CallBlockSync] Falha inesperada:", error);
  }
}
