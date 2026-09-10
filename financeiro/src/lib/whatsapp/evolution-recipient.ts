import { evolutionPayloadLidCandidates } from "@/lib/whatsapp/chat-action-identifiers";
import { readProviderPayload } from "@/lib/whatsapp/provider";

type EvolutionRecipientRequest = (
  path: string,
  body: Record<string, unknown>,
) => Promise<{ ok: boolean; payload: unknown }>;

function evolutionConfig() {
  return {
    url: (process.env.EVOLUTION_API_URL || "http://localhost:8080").replace(/\/+$/, ""),
    apiKey: process.env.EVOLUTION_API_KEY || "",
  };
}

async function requestEvolutionRecipient(
  path: string,
  body: Record<string, unknown>,
) {
  const { url, apiKey } = evolutionConfig();
  const response = await fetch(`${url}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: apiKey,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });

  return {
    ok: response.ok,
    payload: await readProviderPayload(response),
  };
}

function phoneJid(phone: string) {
  const digits = phone.replace(/\D/g, "");
  return digits ? `${digits}@s.whatsapp.net` : "";
}

export async function prepareEvolutionRecipientJid(
  params: {
    instanceName: string;
    phone: string;
    fallbackJid?: string | null;
  },
  request: EvolutionRecipientRequest = requestEvolutionRecipient,
) {
  const fallbackJid = (params.fallbackJid || "").trim() || phoneJid(params.phone);
  if (!fallbackJid || /@(?:hosted\.)?lid$/i.test(fallbackJid)) return fallbackJid;

  const sync = await request(
    `/baileys/getUSyncDevices/${encodeURIComponent(params.instanceName)}`,
    {
      jids: [phoneJid(params.phone)],
      useCache: false,
      ignoreZeroDevices: false,
    },
  );

  if (!sync.ok) return fallbackJid;
  return evolutionPayloadLidCandidates(sync.payload)[0] || fallbackJid;
}
