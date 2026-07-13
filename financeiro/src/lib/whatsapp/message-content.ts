type MessageRecord = Record<string, unknown>;

const MESSAGE_WRAPPER_KEYS = [
  "ephemeralMessage",
  "viewOnceMessage",
  "viewOnceMessageV2",
  "viewOnceMessageV2Extension",
  "documentWithCaptionMessage",
  "deviceSentMessage",
  "editedMessage",
  "futureProofMessage",
] as const;

const TEMPLATE_CONTAINER_KEYS = [
  "hydratedTemplate",
  "hydratedFourRowTemplate",
  "fourRowTemplate",
  "content",
  "highlyStructuredMessage",
  "template",
  "body",
] as const;

function asRecord(value: unknown): MessageRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as MessageRecord)
    : null;
}

function nonEmptyText(value: unknown): string {
  return typeof value === "string" && value.trim() ? value : "";
}

function nestedText(value: unknown, ...path: string[]): string {
  let current = value;

  for (const key of path) {
    const record = asRecord(current);
    if (!record) return "";
    current = record[key];
  }

  return nonEmptyText(current);
}

function extractTemplateText(value: unknown, depth = 0): string {
  if (depth > 6) return "";

  const record = asRecord(value);
  if (!record) return "";

  const directText =
    nonEmptyText(record.hydratedContentText) ||
    nonEmptyText(record.contentText) ||
    nonEmptyText(record.text) ||
    nonEmptyText(record.caption) ||
    nonEmptyText(record.description);

  if (directText) return directText;

  for (const key of TEMPLATE_CONTAINER_KEYS) {
    const nested = extractTemplateText(record[key], depth + 1);
    if (nested) return nested;
  }

  return "";
}

function extractFromMessage(message: unknown, depth = 0): string {
  if (depth > 6) return "";

  const record = asRecord(message);
  if (!record) return "";

  const directText =
    nonEmptyText(record.conversation) ||
    nestedText(record, "extendedTextMessage", "text") ||
    nestedText(record, "imageMessage", "caption") ||
    nestedText(record, "videoMessage", "caption") ||
    nestedText(record, "documentMessage", "caption") ||
    nestedText(record, "buttonsMessage", "contentText") ||
    nestedText(record, "listMessage", "description") ||
    nestedText(record, "interactiveMessage", "body", "text") ||
    nestedText(record, "buttonsResponseMessage", "selectedDisplayText") ||
    nestedText(record, "listResponseMessage", "title") ||
    nestedText(record, "templateButtonReplyMessage", "selectedDisplayText") ||
    extractTemplateText(record.templateMessage);

  if (directText) return directText;

  for (const key of MESSAGE_WRAPPER_KEYS) {
    const wrapper = asRecord(record[key]);
    const nested = extractFromMessage(wrapper?.message, depth + 1);
    if (nested) return nested;
  }

  const protocolMessage = asRecord(record.protocolMessage);
  return extractFromMessage(protocolMessage?.editedMessage, depth + 1);
}

export function extractWhatsAppMessageBody(payload: unknown): string {
  const record = asRecord(payload);
  if (!record) return "";

  return (
    extractFromMessage(record.message) ||
    nonEmptyText(record.text) ||
    nonEmptyText(record.body) ||
    nestedText(record, "content", "text")
  );
}

