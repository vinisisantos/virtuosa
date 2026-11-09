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

/** Interpreta somente datas/horários presentes na oferta aceita, dentro da grade do servidor. */
export function chooseOfferedEvaluationSlot(offerBody: string, replyBody: string, permitted: readonly string[]): string | null {
  const offer = normalize(offerBody);
  const reply = normalize(replyBody).trim();
  if (!/\b(agend\w*|avaliac\w*|horari\w*|vagas?|marcar|prefere|pode ser|tenho|opcao|opcoes)\b/u.test(offer)
    || /\b(nao|indisponivel|indisponiveis|cancelad\w*|fechad\w*)\b/u.test(offer) || reply.includes('?')) return null;
  const dates = [...offer.matchAll(datePattern)];
  if (!dates.length || dates.length > 7) return null;
  const dateKeys = [...new Set(permitted.map((slot) => slot.slice(0, 10)))];
  if (!dateKeys.length) return null;
  const offered = new Set<string>();
  let requiresExplicitTime = false;
  for (const [index, date] of dates.entries()) {
    const matching = dateKeys.filter((key) => dateMatches(key, date));
    const key = matching[0] || `${date[3] || dateKeys[0].slice(0, 4)}-${date[2].padStart(2, '0')}-${date[1].padStart(2, '0')}`;
    const dateValue = new Date(`${key}T12:00:00Z`);
    if (matching.length > 1 || !Number.isFinite(dateValue.getTime()) || dateValue.toISOString().slice(0, 10) !== key) return null;
    const segment = offer.slice(date.index + date[0].length, dates[index + 1]?.index);
    const times = clocks(segment);
    if (!times?.length || times.length > 6) return null;
    const beforeTime = segment.slice(0, times[0].index);
    const isRange = /\b(?:das|de|entre)\s*$/u.test(beforeTime) && !/\ba partir (?:das|de)\s*$/u.test(beforeTime);
    if (isRange) {
      if (times.length !== 2 || times[0].minute >= times[1].minute
        || !/^\s*(?:as|a|ate|e|[-–—])\s*$/u.test(segment.slice(times[0].index + times[0].length, times[1].index))) return null;
      requiresExplicitTime = true;
      for (let minute = Math.ceil(times[0].minute / 30) * 30; minute <= times[1].minute; minute += 30) {
        offered.add(`${key}T${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`);
      }
      continue;
    }
    for (const time of times) {
      offered.add(`${key}T${time.time}`);
    }
  }
  if (!offered.size) return null;
  const replyDates = [...reply.matchAll(datePattern)];
  const replyDays = [...reply.matchAll(weekdayPattern)];
  const replyTimes = clocks(reply);
  if (!replyTimes || replyDates.length > 1 || replyDays.length > 1 || replyTimes.length > 1) return null;
  if (requiresExplicitTime && !replyTimes.length) return null;
  const remaining = reply.replace(datePattern, '').replace(weekdayPattern, '').replace(clockPattern, '')
    .replace(/\b(?:as|na|no|dia)\b/gu, '').replace(/[,.!\s]+/gu, ' ').trim();
  const affirmative = /^(sim|pode|pode ser|pode sim|sim pode|sim pode ser|ok|certo|combinado|confirmo|fechado|ta bom|esta bom|prefiro|eu prefiro|quero|eu quero|quero agendar|pode agendar|pode marcar)$/u.test(remaining);
  if (!affirmative && (remaining || !(replyDates.length || replyDays.length || replyTimes.length))) return null;
  const choices = [...offered].filter((slot) => {
    const key = slot.slice(0, 10);
    if (replyDates.length && !dateMatches(key, replyDates[0])) return false;
    if (replyDays.length && weekdays[new Date(`${key}T12:00:00-03:00`).getUTCDay()] !== replyDays[0][1]) return false;
    return !replyTimes.length || slot.slice(11) === replyTimes[0].time;
  });
  // Desambiguar antes de filtrar disponibilidade evita converter “sim” em escolha de uma opção restante.
  return choices.length === 1 && permitted.includes(choices[0]) ? choices[0] : null;
}
