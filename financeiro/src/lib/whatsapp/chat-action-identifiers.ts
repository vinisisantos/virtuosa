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
  const exactJid = remoteJid.trim();
  const candidates = [primary];

  // Algumas instalações da Evolution 2.3.x falham ao resolver o telefone
  // puro, mas aceitam o JID exato observado no webhook. O status de bloqueio é
  // idempotente, então o fallback pode repetir a mesma intenção com segurança.
  if (
    /@(?:s\.whatsapp\.net|c\.us)$/i.test(exactJid) &&
    exactJid !== primary
  ) {
    candidates.push(exactJid);
  }

  return candidates.filter((candidate, index) => (
    Boolean(candidate) && candidates.indexOf(candidate) === index
  ));
}
