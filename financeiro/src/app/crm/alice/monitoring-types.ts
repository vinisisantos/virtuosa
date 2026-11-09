export type AliceMonitoringData = {
  config: {
    enabled: boolean;
    activatedAt: string | null;
    instanceId: string | null;
    backlogAnchorConversationId: string | null;
    initialDelaySeconds: number;
    complementDelaySeconds: number;
    monthlyLimitUsd: number | null;
  };
  readiness: { ready: boolean; blockers: string[] };
  summary: {
    conversations: number;
    queued: number;
    sent: number;
    uncertain: number;
    failed: number;
    needsHuman: number;
    appointments: number;
    inputTokens: number;
    outputTokens: number;
    costMicroUsd: number;
    unknownCostTurns: number;
    backlogTurns: number;
    averageGenerationMs: number;
    averageResponseMs: number;
    averageBacklogResponseMs: number;
  };
  items: AliceTurn[];
  backlogCandidates: AliceBacklogCandidate[];
  nextCursor: string | null;
  backlogTruncated: boolean;
};

export type AliceTurn = {
  id: string;
  conversationId: string;
  contactName: string | null;
  phoneLast4: string | null;
  status: string;
  createdAt: string;
  firstSentAt: string | null;
  costMicroUsd: number | null;
  error: string | null;
  appointmentId: string | null;
  instanceId: string | null;
};

export type AliceBacklogCandidate = {
  conversationId: string;
  contactName: string | null;
  phoneLast4: string | null;
  lastInboundAt: string;
  unreadCount: number;
  previewToken: string;
};

export const ALICE_STATUSES: Record<string, { label: string; tone: string }> = {
  queued: { label: "Na fila", tone: "neutral" },
  processing: { label: "Preparando", tone: "neutral" },
  sending: { label: "Enviando", tone: "neutral" },
  sent: { label: "Envio aceito", tone: "success" },
  uncertain: { label: "Sem confirmação", tone: "warning" },
  needs_human: { label: "Equipe necessária", tone: "warning" },
  skipped: { label: "Não enviado", tone: "neutral" },
  failed: { label: "Falhou", tone: "danger" },
};

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo",
});

export function formatAliceDate(value?: string | null): string {
  if (!value || !Number.isFinite(new Date(value).getTime())) return "—";
  return dateFormatter.format(new Date(value));
}

export function formatAliceCost(microUsd: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency", currency: "USD", minimumFractionDigits: 2,
    maximumFractionDigits: microUsd > 0 && microUsd < 10_000 ? 4 : 2,
  }).format(microUsd / 1_000_000);
}

export function formatAliceDuration(milliseconds: number): string {
  if (!milliseconds || milliseconds < 0) return "—";
  if (milliseconds < 60_000) return `${(milliseconds / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} s`;
  return `${(milliseconds / 60_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} min`;
}

export function aliceConversationUrl(conversationId: string, instanceId?: string | null): string {
  const query = new URLSearchParams({ unit: "SBC", conversationId });
  if (instanceId) query.set("targetInstanceId", instanceId);
  return `/crm/inbox?${query}`;
}
