export function evaluationScheduleMinuteRange(value: string | Date) {
  const requestedTime = new Date(value);
  if (Number.isNaN(requestedTime.getTime())) {
    throw new Error("Data da avaliação inválida");
  }

  const start = new Date(requestedTime);
  start.setUTCSeconds(0, 0);

  return {
    start,
    end: new Date(start.getTime() + 60_000),
  };
}
