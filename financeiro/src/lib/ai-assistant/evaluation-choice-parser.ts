import { evaluationReplyAffirms } from '#lib/ai-assistant/evaluation-confirmation';

type ClockToken = { index: number; length: number; minute: number; time: string };
const normalize = (text: string) => text.normalize('NFKD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/\p{Cf}/gu, '');
const datePattern = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?(?![\d/])/gu;
const clockPattern = /\b(\d{1,2})(?:h(\d{2})?|:(\d{2})|[ \t]+horas?)(?![\p{L}\p{N}])/gu;
const weekdayPattern = /\b(domingo|segunda|terca|quarta|quinta|sexta|sabado)(?:[ -]feira)?\b/gu;
const weekdays = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];

function clocks(text: string): ClockToken[] | null {
  const values: ClockToken[] = [];
  for (const match of text.matchAll(clockPattern)) {
    const hour = Number(match[1]);
    const minute = Number(match[2] || match[3] || 0);
    if (hour > 23 || minute > 59) return null;
    values.push({ index: match.index, length: match[0].length, minute: hour * 60 + minute,
      time: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}` });
  }
  return values;
}

function dateMatches(key: string, date: RegExpMatchArray): boolean {
  const [year, month, day] = key.split('-');
  return day === date[1].padStart(2, '0') && month === date[2].padStart(2, '0') && (!date[3] || date[3] === year);
}

/** Compartilha a leitura de faixa entre o envio e a reserva, inclusive quando há opções depois dela. */
export function readEvaluationOfferRange(text: string, times: readonly ClockToken[]) {
  let range: { start: ClockToken; end: ClockToken; options: readonly ClockToken[] } | undefined;
  for (let index = 0; index < times.length - 1; index++) {
    const start = times[index];
    const end = times[index + 1];
    const before = text.slice(index ? times[index - 1].index + times[index - 1].length : 0, start.index);
    const between = text.slice(start.index + start.length, end.index).trim();
    const introduced = /\b(?:das|de|entre)\s*$/u.test(before);
    const bounded = /^(?:as|a|ate(?: as?)?|[-–—])$/u.test(between) || introduced && between === 'e';
    if (!bounded) {
      if (introduced && !/\ba partir (?:das?|de)\s*$/u.test(before)) return null;
      continue;
    }
    if (range || index !== 0 || start.minute >= end.minute) return null;
    const options = times.slice(2);
    if (options.length && (!/[.;:\n]|\b(?:opcoes|oferec\w*|prefere|escolh\w*)\b/u.test(text.slice(end.index + end.length, options[0].index))
      || options.some((time) => time.minute < start.minute || time.minute > end.minute))) return null;
    range = { start, end, options };
  }
  return range;
}

/** Recusa uma oferta quando um dia da semana próximo à data a contradiz. */
export function offeredWeekdaysMatchDates(text: string, dateKeys: readonly string[]): boolean {
  const normalized = normalize(text);
  const dates = [...normalized.matchAll(datePattern)];
  const days = [...normalized.matchAll(weekdayPattern)];
  for (const day of days) {
    const dayStart = day.index!;
    const dayEnd = dayStart + day[0].length;
    const nearest = dates.map((date) => {
      const dateStart = date.index!;
      const dateEnd = dateStart + date[0].length;
      return { date, distance: dayEnd < dateStart ? dateStart - dayEnd : dateEnd < dayStart ? dayStart - dateEnd : 0 };
    }).sort((left, right) => left.distance - right.distance)[0];
    if (!nearest || nearest.distance > 24) continue;
    const matchingKeys = [...new Set(dateKeys.filter((key) => dateMatches(key, nearest.date)))];
    if (matchingKeys.length !== 1) return false;
    const weekday = new Date(`${matchingKeys[0]}T12:00:00-03:00`).getUTCDay();
    if (weekdays[weekday] !== day[1]) return false;
  }
  return true;
}

/** Interpreta somente datas/horários presentes na oferta aceita, dentro da grade do servidor. */
export function chooseOfferedEvaluationSlot(offerBody: string, replyBody: string, permitted: readonly string[], dailyOfferLimit?: (dateKey: string) => number): string | null {
  const offer = normalize(offerBody);
  const reply = normalize(replyBody).replace(/\s+/gu, ' ').trim();
  const permittedDateKeys = [...new Set(permitted.map((slot) => slot.slice(0, 10)))];
  if (!/\b(agend\w*|avaliac\w*|horari\w*|vagas?|marcar|prefere|pode ser|tenho|temos?|opcao|opcoes)\b/u.test(offer)
    || /\b(nao|indisponivel|indisponiveis|cancelad\w*|fechad\w*)\b/u.test(offer) || reply.includes('?')) return null;
  if (!offeredWeekdaysMatchDates(offerBody, permittedDateKeys)) return null;
  const dates = [...offer.matchAll(datePattern)];
  if (!dates.length || dates.length > 7) return null;
  const dateKeys = permittedDateKeys;
  if (!dateKeys.length) return null;
  const offered = new Set<string>();
  const nonGridStart = new Set<string>();
  let requiresExplicitTime = false;
  for (const [index, date] of dates.entries()) {
    const matching = dateKeys.filter((key) => dateMatches(key, date));
    const key = matching[0] || `${date[3] || dateKeys[0].slice(0, 4)}-${date[2].padStart(2, '0')}-${date[1].padStart(2, '0')}`;
    const dateValue = new Date(`${key}T12:00:00Z`);
    if (matching.length > 1 || !Number.isFinite(dateValue.getTime()) || dateValue.toISOString().slice(0, 10) !== key) return null;
    const segment = offer.slice(date.index + date[0].length, dates[index + 1]?.index);
    const times = clocks(segment);
    if (!times?.length || times.length > Math.min(48, dailyOfferLimit?.(key) ?? 48)) return null;
    const range = readEvaluationOfferRange(segment, times);
    if (range === null) return null;
    if (!range && /\ba partir (?:das?|de)\s*$/u.test(segment.slice(0, times[0].index))) requiresExplicitTime = true;
    if (range && !range.options.length) {
      if (range.start.minute % 30 !== 0) nonGridStart.add(key);
      requiresExplicitTime = true;
      for (let minute = Math.ceil(range.start.minute / 30) * 30; minute <= range.end.minute; minute += 30) {
        offered.add(`${key}T${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`);
      }
      continue;
    }
    // Compatibilidade com ofertas já enviadas: a lista explícita restringe a faixa, sem criar opções intermediárias.
    for (const time of range?.options || times) {
      offered.add(`${key}T${time.time}`);
    }
  }
  if (!offered.size) return null;
  const replyDates = [...reply.matchAll(datePattern)];
  const replyDays = [...reply.matchAll(weekdayPattern)];
  const replyTimes = clocks(reply);
  if (!replyTimes || replyDates.length > 1 || replyDays.length > 1 || replyTimes.length > 1) return null;
  const firstHour = /\b(?:o |no )?primeiro horario\b/u;
  const earliest = firstHour.test(reply);
  if ((earliest && replyTimes.length) || (requiresExplicitTime && !replyTimes.length && !earliest)) return null;
  const remaining = reply.replace(firstHour, '').replace(datePattern, '').replace(weekdayPattern, '').replace(clockPattern, '')
    .replace(/\b(?:as|na|no|dia)\b/gu, '').replace(/[,.!\s]+/gu, ' ').trim();
  const affirmative = evaluationReplyAffirms(remaining);
  if (!affirmative && (remaining || !(earliest || replyDates.length || replyDays.length || replyTimes.length))) return null;
  const choices = [...offered].filter((slot) => {
    const key = slot.slice(0, 10);
    if (replyDates.length && !dateMatches(key, replyDates[0])) return false;
    if (replyDays.length && weekdays[new Date(`${key}T12:00:00-03:00`).getUTCDay()] !== replyDays[0][1]) return false;
    return !replyTimes.length || slot.slice(11) === replyTimes[0].time;
  });
  // Desambiguar antes de filtrar disponibilidade evita converter “sim” em escolha de uma opção restante.
  if (earliest && new Set(choices.map((slot) => slot.slice(0, 10))).size === 1) {
    const first = choices.sort()[0];
    return !nonGridStart.has(first.slice(0, 10)) && permitted.includes(first) ? first : null;
  }
  return choices.length === 1 && permitted.includes(choices[0]) ? choices[0] : null;
}
