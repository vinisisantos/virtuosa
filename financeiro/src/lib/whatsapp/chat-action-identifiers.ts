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
  if (!primary) return [];
  if (/@(?:hosted\.)?lid$/i.test(primary)) return [primary];

  const digits = primary.replace(/\D/g, "");
  const candidates = [digits];

  // A base do WhatsApp ainda pode registrar números brasileiros antigos sem
  // o nono dígito. A Evolution considera as duas formas ao consultar o número,
  // mas pode devolver apenas uma delas para a operação de bloqueio.
  if (/^55\d{2}9\d{8}$/.test(digits)) {
    candidates.push(`${digits.slice(0, 4)}${digits.slice(5)}`);
  } else if (/^55\d{10}$/.test(digits)) {
    candidates.push(`${digits.slice(0, 4)}9${digits.slice(4)}`);
  }

  return [...new Set(candidates)];
}

function lidFromValue(value: unknown) {
  if (typeof value !== "string") return "";
  const normalized = value.trim();
  return /@(?:hosted\.)?lid$/i.test(normalized) ? normalized : "";
}

function contactJidFromValue(value: unknown) {
  if (typeof value !== "string") return "";
  const normalized = value.trim().replace(/@c\.us$/i, "@s.whatsapp.net");
  return /@(?:s\.whatsapp\.net|(?:hosted\.)?lid)$/i.test(normalized) ? normalized : "";
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

export function evolutionPayloadLidCandidates(payload: unknown) {
  const candidates: string[] = [];
  const visited = new Set<object>();

  const visit = (value: unknown, depth: number) => {
    if (depth > 8 || value == null) return;
    const lid = lidFromValue(value);
    if (lid) {
      if (!candidates.includes(lid)) candidates.push(lid);
      return;
    }
    if (typeof value !== "object" || visited.has(value)) return;
    visited.add(value);

    if (Array.isArray(value)) {
      for (const item of value) visit(item, depth + 1);
      return;
    }

    for (const nested of Object.values(value as Record<string, unknown>)) {
      visit(nested, depth + 1);
    }
  };

  visit(payload, 0);
  return candidates;
}

export function evolutionPayloadContactJidCandidates(payload: unknown) {
  const candidates: string[] = [];
  const visited = new Set<object>();

  const visit = (value: unknown, depth: number) => {
    if (depth > 8 || value == null) return;
    const jid = contactJidFromValue(value);
    if (jid) {
      if (!candidates.includes(jid)) candidates.push(jid);
      return;
    }
    if (typeof value !== "object" || visited.has(value)) return;
    visited.add(value);

    if (Array.isArray(value)) {
      for (const item of value) visit(item, depth + 1);
      return;
    }

    for (const nested of Object.values(value as Record<string, unknown>)) {
      visit(nested, depth + 1);
    }
  };

  visit(payload, 0);
  return candidates;
}
