export type InboxAppointment = {
  id: string;
  unit: string;
  startTime: string;
};

export type InboxAppointmentSnapshot = Record<string, InboxAppointment>;

// Somente estados operacionais explícitos: status desconhecido/finalizado
// não pode suspender o atendimento por ser normalizado como "pendente".
export const ACTIVE_INBOX_APPOINTMENT_STATUSES = [
  "pendente", "confirmado", "nao_confirmou", "não confirmou", "nao confirmou",
  "nao_confirmado", "sem_confirmacao",
];

export function withInboxAppointment<T extends { id: string; scheduledEvaluation?: InboxAppointment | null }>(
  conversation: T,
  snapshot: InboxAppointmentSnapshot,
): T {
  const next = snapshot[conversation.id] || null;
  const current = conversation.scheduledEvaluation;
  if (
    (!current && !next)
    || (current && next && current.id === next.id && current.startTime === next.startTime && current.unit === next.unit)
  ) {
    return conversation;
  }
  return { ...conversation, scheduledEvaluation: next };
}
