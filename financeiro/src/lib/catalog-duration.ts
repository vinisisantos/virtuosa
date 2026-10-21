export function catalogEndTime(startHour: number, startMinute: number, duration: number) {
  if (!Number.isInteger(duration) || duration <= 0) return null;
  const total = startHour * 60 + startMinute + duration;
  if (!Number.isFinite(total) || total < 7 * 60 || total > 21 * 60 + 59) return null;
  return { endH: String(Math.floor(total / 60)).padStart(2, '0'), endM: String(total % 60).padStart(2, '0') };
}
