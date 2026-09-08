export const EVALUATION_NO_RESPONSE_TRIGGER = "evaluation_confirmation_no_response";
export const DEFAULT_NO_RESPONSE_DELAY_HOURS = 2;
export const MAX_NO_RESPONSE_DELAY_HOURS = 24;
export const DEFAULT_NO_RESPONSE_MESSAGE = "Olá, {{primeiro_nome}}! Ainda não recebemos sua confirmação para {{data}} às {{hora}}. Será um prazer receber você! 💜\n\nPodemos contar com sua presença? Se precisar, ajudamos a reagendar.";

export function validNoResponseDelay(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= MAX_NO_RESPONSE_DELAY_HOURS;
}

export function noResponseConfig(value: unknown) {
  const config = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
  const activatedAt = typeof config.activatedAt === "string" ? new Date(config.activatedAt) : null;
  return {
    delayHours: validNoResponseDelay(config.delayHours) ? config.delayHours : DEFAULT_NO_RESPONSE_DELAY_HOURS,
    activatedAt: activatedAt && Number.isFinite(activatedAt.getTime()) ? activatedAt : null,
  };
}

export function noResponseSendingHours(now: Date) {
  const hour = Number(new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo", hour: "2-digit", hourCycle: "h23",
  }).format(now));
  return hour >= 8 && hour < 21;
}

// A ocorrência pertence ao agendamento, não à configuração editável da unidade.
export function noResponseExecutionId(appointmentId: string, startTime: Date) {
  return `${EVALUATION_NO_RESPONSE_TRIGGER}:${appointmentId}:${startTime.toISOString()}`;
}
