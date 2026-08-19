export const LEGACY_EVALUATION_CONFIRMATION_WINDOW_HOURS = 24;
export const DEFAULT_EVALUATION_CONFIRMATION_WINDOW_HOURS = 72;
export const EVALUATION_CONFIRMATION_WINDOW_CONFIG_VERSION = 2;
export const MIN_EVALUATION_CONFIRMATION_WINDOW_HOURS = 1;
export const MAX_EVALUATION_CONFIRMATION_WINDOW_HOURS = 168;
export const EVALUATION_CONFIRMATION_WINDOW_HOURS = DEFAULT_EVALUATION_CONFIRMATION_WINDOW_HOURS;
export const EVALUATION_CONFIRMATION_WINDOW_MS = EVALUATION_CONFIRMATION_WINDOW_HOURS * 60 * 60 * 1000;

export type EvaluationConfirmationWindowState = "too_early" | "available" | "expired";

export function normalizeEvaluationConfirmationWindowHours(value: unknown) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return DEFAULT_EVALUATION_CONFIRMATION_WINDOW_HOURS;
  return Math.min(
    MAX_EVALUATION_CONFIRMATION_WINDOW_HOURS,
    Math.max(MIN_EVALUATION_CONFIRMATION_WINDOW_HOURS, parsed),
  );
}

export function isValidEvaluationConfirmationWindowHours(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed)
    && parsed >= MIN_EVALUATION_CONFIRMATION_WINDOW_HOURS
    && parsed <= MAX_EVALUATION_CONFIRMATION_WINDOW_HOURS;
}

export function evaluationConfirmationWindow(params: {
  startTime: Date;
  now?: Date;
  windowHours?: number;
}): {
  state: EvaluationConfirmationWindowState;
  eligibleAt: Date;
} {
  const now = params.now || new Date();
  const windowHours = normalizeEvaluationConfirmationWindowHours(params.windowHours);
  const eligibleAt = new Date(params.startTime.getTime() - windowHours * 60 * 60 * 1000);

  if (now >= params.startTime) return { state: "expired", eligibleAt };
  if (now < eligibleAt) return { state: "too_early", eligibleAt };
  return { state: "available", eligibleAt };
}
