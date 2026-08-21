export function whatsappConversationJid(
  lastKnownJid: string | null | undefined,
  phone: string,
) {
  const exactJid = (lastKnownJid || "").trim();
  if (/@(?:s\.whatsapp\.net|c\.us|(?:hosted\.)?lid)$/i.test(exactJid)) return exactJid;

  const phoneDigits = phone.replace(/\D/g, "");
  return phoneDigits.length >= 8 ? `${phoneDigits}@s.whatsapp.net` : "";
}

export function evolutionConversationNumber(remoteJid: string, phone: string) {
  if (/@(?:hosted\.)?lid$/i.test(remoteJid)) return remoteJid;
  const remoteDigits = remoteJid
    .replace(/@(?:s\.whatsapp\.net|c\.us)$/i, "")
    .replace(/\D/g, "");
  return remoteDigits || phone.replace(/\D/g, "");
}

export function evolutionBlockNumberCandidates(remoteJid: string, phone: string) {
  const primary = evolutionConversationNumber(remoteJid, phone);
  return primary ? [primary] : [];
}

function lidFromValue(value: unknown) {
  if (typeof value !== "string") return "";
  const normalized = value.trim();
  return /@(?:hosted\.)?lid$/i.test(normalized) ? normalized : "";
}

function messageContextInfos(message: unknown) {
  if (!message || typeof message !== "object") return [];
  const data = message as Record<string, unknown>;
  const contexts: unknown[] = [data.contextInfo];

  for (const value of Object.values(data)) {
    if (value && typeof value === "object") {
      contexts.push((value as Record<string, unknown>).contextInfo);
    }
  }

  return contexts;
}

export function evolutionMessageLidCandidates(payload: unknown) {
  if (!payload || typeof payload !== "object") return [];
  const data = payload as Record<string, any>;
  const records = Array.isArray(data.messages?.records)
    ? data.messages.records
    : Array.isArray(data.records)
      ? data.records
      : [data];
  const candidates: string[] = [];

  for (const record of records) {
    if (!record || typeof record !== "object") continue;
    const contexts = [record.contextInfo, ...messageContextInfos(record.message)];
    const values = [
      record.key?.remoteJidAlt,
      record.key?.remoteJid,
      ...contexts.flatMap((context) => {
        if (!context || typeof context !== "object") return [];
        const value = context as Record<string, unknown>;
        return [value.remoteJid, value.participant, value.remoteJidAlt, value.participantAlt];
      }),
    ];

    for (const value of values) {
      const lid = lidFromValue(value);
      if (lid && !candidates.includes(lid)) candidates.push(lid);
    }
  }

  return candidates;
}
