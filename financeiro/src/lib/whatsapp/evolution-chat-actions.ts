import {
  readProviderPayload,
  summarizeProviderError,
} from "@/lib/whatsapp/provider";
import { evolutionConversationNumber } from "@/lib/whatsapp/chat-action-identifiers";

type BlockStatus = "block" | "unblock";

function evolutionConfig() {
  return {
    url: (process.env.EVOLUTION_API_URL || "http://localhost:8080").replace(/\/+$/, ""),
    apiKey: process.env.EVOLUTION_API_KEY || "",
  };
}

function evolutionHeaders() {
  return {
    "Content-Type": "application/json",
    apikey: evolutionConfig().apiKey,
  };
}

async function evolutionRequest(path: string, body: unknown, timeoutMs = 15000) {
  const response = await fetch(`${evolutionConfig().url}${path}`, {
    method: "POST",
    headers: evolutionHeaders(),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const payload = await readProviderPayload(response);
  return { response, payload };
}

function providerErrorMessage(payload: unknown, fallback: string) {
  const details = summarizeProviderError(payload);
  return details ? `${fallback}: ${details}` : fallback;
}

export async function editEvolutionChatMessage(params: {
  instanceName: string;
  phone: string;
  remoteJid: string;
  messageId: string;
  text: string;
}) {
  const number = evolutionConversationNumber(params.remoteJid, params.phone);
  const key = { remoteJid: params.remoteJid, fromMe: true, id: params.messageId };
  const { response, payload } = await evolutionRequest(
    `/chat/updateMessage/${encodeURIComponent(params.instanceName)}`,
    { number, key, text: params.text },
  );

  if (!response.ok) {
    throw new Error(providerErrorMessage(payload, "O WhatsApp não confirmou a edição"));
  }

  return payload;
}

export async function updateEvolutionContactBlock(params: {
  instanceName: string;
  phone: string;
  remoteJid: string;
  status: BlockStatus;
}) {
  const number = evolutionConversationNumber(params.remoteJid, params.phone);
  const { response, payload } = await evolutionRequest(
    `/chat/updateBlockStatus/${encodeURIComponent(params.instanceName)}`,
    { number, status: params.status },
  );

  if (!response.ok) {
    throw new Error(providerErrorMessage(payload, "O WhatsApp não confirmou o bloqueio"));
  }
}
