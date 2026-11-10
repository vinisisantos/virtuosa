import { buildSbcEvaluationOptions } from "@/lib/ai-assistant/sbc-scheduling-policy";
import { offeredWeekdaysMatchDates } from "@/lib/ai-assistant/evaluation-choice-parser";

export function aliceAutonomySchedulingTextValid(messages: string[], now = new Date()) {
  const slots = buildSbcEvaluationOptions(now);
  const dateKeys = [...new Set(slots.map((slot) => slot.slice(0, 10)))];
  for (const text of messages) {
    if (!offeredWeekdaysMatchDates(text, dateKeys)) return false;
    const dates = [...text.matchAll(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\b/gu)];
    const times = [...text.matchAll(/\b(\d{1,2})(?:h(?:(\d{2}))?|:(\d{2}))(?!\d)/giu)].filter((match) => {
      const before = text.slice(Math.max(0, match.index! - 45), match.index).normalize("NFD").replace(/\p{Diacritic}/gu, "");
      const after = text.slice(match.index! + match[0].length, match.index! + match[0].length + 25);
      return !/(?:duracao (?:de )?|dura |leva |demora |durante |cerca de |aproximadamente )$/iu.test(before)
        && !/^\s+de (?:duracao|sessao)/iu.test(after.normalize("NFD").replace(/\p{Diacritic}/gu, ""));
    });
    if (!times.length) continue;
    // A confirmação da agenda usa uma oferta com data explícita. "Amanhã"
    // ou somente "10h" não fornecem uma chave estável para validar o envio.
    if (!dates.length) return false;
    for (const [, day, month, year] of dates) {
      const keys = slots.filter((slot) => slot.slice(5, 10) === `${month.padStart(2, "0")}-${day.padStart(2, "0")}`
        && (!year || slot.startsWith(year)));
      for (const [, hour, minutesH, minutesColon] of times) {
        const time = `${hour.padStart(2, "0")}:${minutesH || minutesColon || "00"}`;
        if (!keys.some((key) => key.endsWith(`T${time}`))) return false;
      }
    }
  }
  return true;
}
