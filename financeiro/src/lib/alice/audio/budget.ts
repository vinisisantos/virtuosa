/** Reserva download privado (10s), fornecedor (30s) e conclusão de banco antes de iniciar o POST pago. */
export function requireAliceAudioBudget(deadlineMs?: number, nowMs = Date.now()) {
  if (deadlineMs !== undefined && nowMs + 45_000 > deadlineMs) throw new Error("audio_worker_budget_wait");
}
