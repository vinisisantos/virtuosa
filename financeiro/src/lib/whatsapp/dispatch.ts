export type DispatchSource = "inbox_bulk" | "follow_up_bulk";
export type DispatchUnit = "Osasco" | "SBC" | "SCS";
export type DispatchMetadata = {
  version: 1;
  unit: DispatchUnit;
  batchId: string;
  source: DispatchSource;
  campaignName: string | null;
};
export type DispatchSnapshot = {
  id: string;
  conversationId: string;
  metadata: DispatchMetadata;
  sentAt: string;
  sentByName: string;
  status: string;
};

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

function resolveDispatchUnit(instanceUnit?: string | null, contactUnit?: string | null): DispatchUnit | null {
  // A unidade escolhida na interface não pode substituir a unidade real da caixa/contato.
  const unit = instanceUnit === "Todas" ? contactUnit : instanceUnit;
  return unit === "Osasco" || unit === "SBC" || unit === "SCS" ? unit : null;
}

export function dispatchUnitEnabled(instanceUnit?: string | null, contactUnit?: string | null) {
  return resolveDispatchUnit(instanceUnit, contactUnit) !== null;
}

export function parseDispatchRequest(value: unknown) {
  const data = object(value);
  if (!data || typeof data.batchId !== "string" || !/^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i.test(data.batchId)
    || !["inbox_bulk", "follow_up_bulk"].includes(String(data.source))
    || !Number.isInteger(data.size) || Number(data.size) < 1 || Number(data.size) > 10) return null;
  return {
    batchId: data.batchId,
    source: data.source as DispatchSource,
    campaignName: typeof data.campaignName === "string" ? data.campaignName.trim().slice(0, 160) || null : null,
  };
}

export function dispatchMetadataForSend(value: unknown, instanceUnit?: string | null, contactUnit?: string | null): DispatchMetadata | null {
  const request = parseDispatchRequest(value);
  const unit = resolveDispatchUnit(instanceUnit, contactUnit);
  return request && unit ? { version: 1, unit, ...request } : null;
}

export function readDispatchMetadata(value: unknown): DispatchMetadata | null {
  const data = object(value);
  if (!data || data.version !== 1 || !["Osasco", "SBC", "SCS"].includes(String(data.unit))) return null;
  const parsed = parseDispatchRequest({ ...data, size: 1 });
  return parsed ? { version: 1, unit: data.unit as DispatchUnit, ...parsed } : null;
}

export function dispatchSnapshot(message: {
  id: string; conversationId: string; fromMe: boolean; dispatchMetadata?: unknown;
  timestamp: Date | string; respondedByName?: string | null; status: string;
}): DispatchSnapshot | null {
  const metadata = readDispatchMetadata(message.dispatchMetadata);
  if (!message.fromMe || !metadata) return null;
  const sentAt = new Date(message.timestamp);
  if (!Number.isFinite(sentAt.getTime())) return null;
  return {
    id: message.id, conversationId: message.conversationId, metadata,
    sentAt: sentAt.toISOString(), sentByName: message.respondedByName || "Operador", status: message.status,
  };
}

export function dispatchLabel(metadata: DispatchMetadata) {
  return metadata.source === "follow_up_bulk" ? "Rechame em lote" : "Disparo em lote";
}

export function dispatchDeliveryStatus(status: string) {
  switch (status.toLowerCase()) {
    case "read": case "read_ack": return { label: "Lida", tone: "success", detail: "Leitura informada pelo WhatsApp." } as const;
    case "played": return { label: "Reproduzida", tone: "success", detail: "Reprodução informada pelo WhatsApp." } as const;
    case "delivered": case "delivery_ack": return { label: "Entregue", tone: "success", detail: "Entrega informada pelo WhatsApp." } as const;
    case "sent": case "server_ack": return { label: "Enviada", tone: "neutral", detail: "Envio aceito. A entrega ainda não foi confirmada pelo WhatsApp." } as const;
    case "failed": case "error": return { label: "Falha", tone: "error", detail: "O WhatsApp informou uma falha após aceitar o envio." } as const;
    case "deleted": return { label: "Excluída", tone: "neutral", detail: "A mensagem foi excluída; o registro do disparo foi preservado." } as const;
    default: return { label: "Aguardando status", tone: "neutral", detail: "Não há confirmação de entrega disponível." } as const;
  }
}
