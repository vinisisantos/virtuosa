export const EVALUATION_CONFIRMATION_WINDOW_HOURS = 48;
export const EVALUATION_CONFIRMATION_WINDOW_MS = EVALUATION_CONFIRMATION_WINDOW_HOURS * 60 * 60 * 1000;

export type EvaluationConfirmationWindowState = "too_early" | "available" | "expired";

export function evaluationConfirmationWindow(params: {
  startTime: Date;
  now?: Date;
}): {
  state: EvaluationConfirmationWindowState;
  eligibleAt: Date;
} {
  const now = params.now || new Date();
  const eligibleAt = new Date(params.startTime.getTime() - EVALUATION_CONFIRMATION_WINDOW_MS);

  if (now >= params.startTime) return { state: "expired", eligibleAt };
  if (now < eligibleAt) return { state: "too_early", eligibleAt };
  return { state: "available", eligibleAt };
}
