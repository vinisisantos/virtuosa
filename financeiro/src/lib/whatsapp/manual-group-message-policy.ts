export const PINK_FRIDAY_SBC_GROUP_INSTANCE_ID = "a6871ee7-8352-4b66-bfb2-b8dba9e4f8e3";
export const PINK_FRIDAY_SBC_GROUP_INSTANCE_NAME = "Leads - Paloma SBC";
export const PINK_FRIDAY_SBC_GROUP_NAME = "💗PINK FRIDAY NA VIRTUOSA SBC🖤";
export const PINK_FRIDAY_SBC_GROUP_UNIT = "SBC";

export const DEFAULT_PINK_FRIDAY_SBC_MESSAGE =
  "Boa noite Virtuosas, tudo bem ?\n\nEstão preparadas para amanha? Se não estiverem podem ir se preparando";

export const MAX_MANUAL_GROUP_MESSAGE_LENGTH = 4096;

export function normalizeManualGroupMessage(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const message = value.replace(/\r\n?/g, "\n").trim();
  if (!message || message.length > MAX_MANUAL_GROUP_MESSAGE_LENGTH
    || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(message)) return null;
  return message;
}
