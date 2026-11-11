import { buildSbcEvaluationOptions } from "@/lib/ai-assistant/sbc-scheduling-policy";
import { offeredWeekdaysMatchDates } from "@/lib/ai-assistant/evaluation-choice-parser";
import { ALICE_MAX_OFFERED_SLOTS, aliceEvaluationAllowedPeriods, aliceOfferClaimsUnsupportedScarcity,
  evaluationSlotPeriod } from "@/lib/ai-assistant/evaluation-offer-policy";

type Clock = { index: number; length: number; minute: number; time: string };
const normalize = (text: string) => text.normalize("NFKD").replace(/\p{Diacritic}|\p{Cf}/gu, "").toLowerCase();

function schedulingClocks(text: string): Clock[] {
  return [...text.matchAll(/\b(\d{1,2})(?:h(?:(\d{2}))?|:(\d{2})|\s+horas?)(?![\p{L}\p{N}])/giu)].filter((match) => {
    const before = text.slice(Math.max(0, match.index! - 45), match.index);
    const after = text.slice(match.index! + match[0].length, match.index! + match[0].length + 25);
    return !/(?:duracao (?:de )?|dura |leva |demora |durante |cerca de |aproximadamente )$/u.test(before)
      && !/^\s+de (?:duracao|sessao)/u.test(after);
  }).map((match) => ({ index: match.index!, length: match[0].length,
    minute: Number(match[1]) * 60 + Number(match[2] || match[3] || 0),
    time: `${match[1].padStart(2, "0")}:${match[2] || match[3] || "00"}` }));
}

export function aliceAutonomySchedulingTextValid(messages: string[], now = new Date(), prompt?: unknown) {
  const slots = buildSbcEvaluationOptions(now);
  const proposedGrid = prompt && typeof prompt === "object" ? (prompt as Record<string, unknown>).HORARIOS_SBC : undefined;
  const requestedSlots = Array.isArray(proposedGrid) ? new Set(proposedGrid.filter((slot): slot is string => typeof slot === "string")) : null;
  const permitted = new Set(slots.filter((slot) => !requestedSlots || requestedSlots.has(slot)));
  const dateKeys = [...new Set([...permitted].map((slot) => slot.slice(0, 10)))];
  const periods = aliceEvaluationAllowedPeriods(prompt, now);
  const offered = new Set<string>();
  const allow = (key: string, time: string) => {
    const slot = `${key}T${time}`;
    if (!permitted.has(slot) || !periods.has(evaluationSlotPeriod(time))) return false;
    offered.add(slot);
    return offered.size <= ALICE_MAX_OFFERED_SLOTS;
  };
  for (const message of messages) {
    if (aliceOfferClaimsUnsupportedScarcity(message)) return false;
    const text = normalize(message);
    if (!offeredWeekdaysMatchDates(text, dateKeys)) return false;
    const dates = [...text.matchAll(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\b/gu)];
    const times = schedulingClocks(text);
    if (!times.length) continue;
    // A confirmação da agenda usa uma oferta com data explícita. "Amanhã"
    // ou somente "10h" não fornecem uma chave estável para validar o envio.
    if (!dates.length) return false;
    // Em listas com vários dias a data precede seus horários, conforme o contrato do gerador.
    if (dates.length > 1 && times.some((time) => time.index < dates[0].index!)) return false;
    for (const [index, date] of dates.entries()) {
      const [, day, month, year] = date;
      const keys = dateKeys.filter((key) => key.slice(5, 10) === `${month.padStart(2, "0")}-${day.padStart(2, "0")}`
        && (!year || key.startsWith(year)));
      if (keys.length !== 1) return false;
      const scopedTimes = dates.length === 1 ? times : times.filter((time) => time.index >= date.index! + date[0].length
        && time.index < (dates[index + 1]?.index ?? text.length));
      if (scopedTimes.length === 1) {
        const [time] = scopedTimes;
        const before = text.slice(Math.max(0, time.index - 45), time.index);
        const after = text.slice(time.index + time.length, dates[index + 1]?.index ?? text.length);
        if (/\b(?:a partir (?:das?|de)|apos(?: as?)?|depois das?|ate(?: as?)?)\s*$/u.test(before)
          || /^\s*(?:em diante|ate (?:fechar|o fechamento))/u.test(after)) return false;
      }
      for (const time of scopedTimes) if (!allow(keys[0], time.time)) return false;
      if (scopedTimes.length === 2) {
        const [first, last] = scopedTimes;
        const before = text.slice(dates.length === 1 ? 0 : date.index! + date[0].length, first.index);
        const between = text.slice(first.index + first.length, last.index).trim();
        if (/^(?:as|a|ate(?: as?)?|[-–—])$/u.test(between)
          || /\b(?:das|de|entre)\s*$/u.test(before) && between === "e") {
          if (first.minute >= last.minute) return false;
          for (let minute = first.minute; minute <= last.minute; minute += 30) {
            const time = `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
            if (!allow(keys[0], time)) return false;
          }
        }
      }
    }
  }
  return true;
}
