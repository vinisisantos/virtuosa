import {
  readProviderPayload,
  summarizeProviderError,
} from "@/lib/whatsapp/provider";
import {
  evolutionBlockNumberCandidates,
  evolutionConversationNumber,
  evolutionMessageLidCandidates,
} from "@/lib/whatsapp/chat-action-identifiers";

type BlockStatus = "block" | "unblock";
type EvolutionBlockResult = { remoteJid: string };

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
  messageIds?: string[];
  status: BlockStatus;
}): Promise<EvolutionBlockResult> {
  const candidates = evolutionBlockNumberCandidates(params.remoteJid, params.phone);
  let lastFailure: { response: Response; payload: unknown } | null = null;
  const attemptedNumbers = new Set<string>();

  const attemptBlock = async (number: string) => {
    const normalized = number.trim();
    if (!normalized || attemptedNumbers.has(normalized)) return null;
    attemptedNumbers.add(normalized);

    return evolutionRequest(
      `/chat/updateBlockStatus/${encodeURIComponent(params.instanceName)}`,
      { number: normalized, status: params.status },
    );
  };

  for (const number of candidates) {
    const result = await attemptBlock(number);
    if (!result) continue;
    if (result.response.ok) return { remoteJid: params.remoteJid };
    lastFailure = result;

    if (result.response.status < 500) break;
  }

  const providerFailure = summarizeProviderError(lastFailure?.payload);
  const shouldResolveLid = lastFailure?.response.status === 500
    && /bad-request|error blocking user/i.test(providerFailure);

  if (shouldResolveLid && !/@(?:hosted\.)?lid$/i.test(params.remoteJid)) {
    const phoneJid = params.remoteJid.trim().match(/@(?:s\.whatsapp\.net|c\.us)$/i)
      ? params.remoteJid.trim().replace(/@c\.us$/i, "@s.whatsapp.net")
      : `${params.phone.replace(/\D/g, "")}@s.whatsapp.net`;
    const lidCandidates: string[] = [];
    const appendLids = (payload: unknown) => {
      for (const lid of evolutionMessageLidCandidates(payload)) {
        if (!lidCandidates.includes(lid)) lidCandidates.push(lid);
      }
    };

    // O ID da mensagem não depende de sabermos previamente se a Evolution
    // gravou a conversa pelo PN ou pelo LID, portanto é a fonte mais segura.
    for (const messageId of [...new Set(params.messageIds || [])].slice(0, 5)) {
      const history = await evolutionRequest(
        `/chat/findMessages/${encodeURIComponent(params.instanceName)}`,
        { where: { key: { id: messageId } }, page: 1, offset: 10 },
      ).catch(() => null);
      if (history?.response.ok) appendLids(history.payload);
    }

    // Mantém compatibilidade com históricos anteriores, nos quais o PN e o
    // LID alternativo foram persistidos juntos pela Evolution.
    const history = await evolutionRequest(
      `/chat/findMessages/${encodeURIComponent(params.instanceName)}`,
      { where: { key: { remoteJid: phoneJid } }, page: 1, offset: 20 },
    ).catch(() => null);
    if (history?.response.ok) appendLids(history.payload);

    for (const number of lidCandidates) {
      const result = await attemptBlock(number);
      if (!result) continue;
      if (result.response.ok) return { remoteJid: number };
      lastFailure = result;
      if (result.response.status < 500) break;
    }
  }

  throw new Error(providerErrorMessage(
    lastFailure?.payload,
    "O WhatsApp não confirmou o bloqueio",
  ));
}
