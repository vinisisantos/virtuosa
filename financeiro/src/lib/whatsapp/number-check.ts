import {
  getInstanceProvider,
  readProviderPayload,
  summarizeProviderError,
  wahaRequest,
} from "@/lib/whatsapp/provider";

export type WhatsAppNumberCheckResult = {
  exists: boolean;
  number: string;
  jid: string | null;
};

export class WhatsAppNumberCheckError extends Error {
  constructor(message: string, public readonly status = 502) {
    super(message);
    this.name = "WhatsAppNumberCheckError";
  }
}

export function normalizeWhatsAppNumber(value: string) {
  const digits = (value || "").replace(/\D/g, "");
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

export function isValidWhatsAppNumber(value: string) {
  const digits = normalizeWhatsAppNumber(value);
  return digits.length >= 10 && digits.length <= 15;
}

function digitsFromJid(value?: string | null) {
  return (value || "").split("@")[0].replace(/\D/g, "");
}

async function checkEvolutionNumber(instanceName: string, number: string) {
  const url = (process.env.EVOLUTION_API_URL || "http://localhost:8080").replace(/\/+$/, "");
  const apiKey = process.env.EVOLUTION_API_KEY || "";
  if (!url || !apiKey) {
    throw new WhatsAppNumberCheckError("Evolution API não configurada", 500);
  }

  const res = await fetch(`${url}/chat/whatsappNumbers/${encodeURIComponent(instanceName)}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: apiKey,
    },
    body: JSON.stringify({ numbers: [number] }),
    signal: AbortSignal.timeout(15000),
  });
  const data = await readProviderPayload(res);
  if (!res.ok) {
    throw new WhatsAppNumberCheckError(
      summarizeProviderError(data) || `Evolution API respondeu ${res.status}`,
      res.status,
    );
  }

  const item = Array.isArray(data) ? data[0] : data;
  if (!item || typeof item !== "object") {
    throw new WhatsAppNumberCheckError("Resposta inválida da Evolution API");
  }

  const payload = item as Record<string, unknown>;
  const jid = typeof payload.jid === "string" ? payload.jid : null;
  const returnedNumber = typeof payload.number === "string" ? payload.number.replace(/\D/g, "") : "";
  return {
    exists: payload.exists === true,
    number: returnedNumber || digitsFromJid(jid) || number,
    jid,
  } satisfies WhatsAppNumberCheckResult;
}

async function checkWahaNumber(instanceName: string, number: string) {
  const params = new URLSearchParams({ phone: number, session: instanceName });
  const res = await wahaRequest(`/api/contacts/check-exists?${params.toString()}`, {
    method: "GET",
    signal: AbortSignal.timeout(15000),
  });
  const data = await readProviderPayload(res);
  if (!res.ok) {
    throw new WhatsAppNumberCheckError(
      summarizeProviderError(data) || `WAHA respondeu ${res.status}`,
      res.status,
    );
  }
  if (!data || typeof data !== "object") {
    throw new WhatsAppNumberCheckError("Resposta inválida da WAHA");
  }

  const payload = data as Record<string, unknown>;
  const jid = typeof payload.chatId === "string" ? payload.chatId : null;
  return {
    exists: payload.numberExists === true,
    number: digitsFromJid(jid) || number,
    jid,
  } satisfies WhatsAppNumberCheckResult;
}

export async function checkWhatsAppNumber(
  instance: { name: string; provider?: string | null },
  rawNumber: string,
) {
  const number = normalizeWhatsAppNumber(rawNumber);
  if (!isValidWhatsAppNumber(number)) {
    throw new WhatsAppNumberCheckError("Número de telefone inválido", 400);
  }

  return getInstanceProvider(instance) === "waha"
    ? checkWahaNumber(instance.name, number)
    : checkEvolutionNumber(instance.name, number);
}
