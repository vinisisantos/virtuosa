const CRM_MEDIA_BATCH_PREFIX = "crm-media-batch";
const CRM_MEDIA_BATCH_ID_PATTERN = /^[a-zA-Z0-9_-]{8,96}$/;

export interface CrmMediaBatchMarker {
  id: string;
  messageIds: string[];
}

export function normalizeCrmMediaBatch(value: {
  id?: unknown;
  messageIds?: unknown;
}): CrmMediaBatchMarker | null {
  const id = typeof value.id === "string" ? value.id.trim() : "";
  const messageIds = Array.isArray(value.messageIds)
    ? value.messageIds.map((item) => typeof item === "string" ? item.trim() : "")
    : [];
  const uniqueMessageIds = [...new Set(messageIds)];

  if (
    !CRM_MEDIA_BATCH_ID_PATTERN.test(id) ||
    uniqueMessageIds.length !== messageIds.length ||
    uniqueMessageIds.length < 2 ||
    uniqueMessageIds.length > 10 ||
    uniqueMessageIds.some((messageId) => messageId.length < 4 || messageId.length > 200)
  ) {
    return null;
  }

  return { id, messageIds: uniqueMessageIds };
}

export function buildCrmMediaBatchMarkerBody(batch: CrmMediaBatchMarker) {
  return `${CRM_MEDIA_BATCH_PREFIX}:${JSON.stringify({ version: 1, ...batch })}`;
}

export function parseCrmMediaBatchMarkerBody(body?: string | null): CrmMediaBatchMarker | null {
  const clean = (body || "").trim();
  if (!clean.startsWith(`${CRM_MEDIA_BATCH_PREFIX}:`)) return null;

  try {
    const parsed = JSON.parse(clean.slice(CRM_MEDIA_BATCH_PREFIX.length + 1)) as Record<string, unknown>;
    if (parsed.version !== 1) return null;
    return normalizeCrmMediaBatch({ id: parsed.id, messageIds: parsed.messageIds });
  } catch {
    return null;
  }
}
