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
