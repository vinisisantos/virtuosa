export const SBC_ATTENDANCE_HOURS = {
  weekday: { firstMinute: 10 * 60, lastMinute: 20 * 60 },
  saturday: { firstMinute: 8 * 60, lastMinute: 13 * 60 },
} as const;

export function sbcAttendanceHours(weekday: number) {
  return weekday === 0 ? null : SBC_ATTENDANCE_HOURS[weekday === 6 ? "saturday" : "weekday"];
}

const clock = (minute: number) => `${Math.floor(minute / 60)}h${minute % 60 ? String(minute % 60).padStart(2, "0") : ""}`;
export const SBC_WEEKDAY_ATTENDANCE = `De segunda a sexta, atendemos das ${clock(SBC_ATTENDANCE_HOURS.weekday.firstMinute)} às ${clock(SBC_ATTENDANCE_HOURS.weekday.lastMinute)}.`;
export const SBC_SATURDAY_ATTENDANCE = `Aos sábados, atendemos das ${clock(SBC_ATTENDANCE_HOURS.saturday.firstMinute)} às ${clock(SBC_ATTENDANCE_HOURS.saturday.lastMinute)}.`;
export const SBC_OUT_OF_HOURS_INSTRUCTIONS = `PERIODO_DE_ATENDIMENTO_SBC. ${SBC_WEEKDAY_ATTENDANCE} ${SBC_SATURDAY_ATTENDANCE} Não há avaliações no domingo. Os inícios de avaliação seguem intervalos de 30 minutos. Ao informar os períodos, preserve literalmente a frase acima correspondente ao dia, como uma frase independente; ela descreve funcionamento e não uma lista de vagas. Quando a cliente pedir um dia ou horário fora da grade, explique o período de atendimento daquele dia e que só podemos agendar dentro da grade. Continue buscando uma alternativa compatível com o trabalho, dia e período já informados; quando sábado não comportar o horário, pergunte se existe possibilidade durante a semana. Não repita opções recusadas nem encaminhe para humano apenas por incompatibilidade de horário. Descrever o período de atendimento não é oferecer todos os horários nem reservar uma avaliação. Para ofertas concretas continue usando somente HORARIOS_SBC, poucas opções com data, e registre apenas escolha inequívoca pelo CRM.`;
export const SBC_SCHEDULING_RETRY_INSTRUCTIONS = `CORRECAO_DE_HORARIOS. A resposta anterior sugeriu uma opção que o sistema não pode enviar. Nesta recuperação não ofereça data nem opção concreta de horário. Você pode explicar o período de atendimento usando literalmente estas frases independentes: ${SBC_WEEKDAY_ATTENDANCE} ${SBC_SATURDAY_ATTENDANCE} Explique que só agendamos dentro desses períodos. Reconheça a restrição da cliente sem repetir horários numéricos fora dessas frases e pergunte por uma alternativa compatível de dia ou período. Continue a negociação como Alice, sem delegar a confirmação de alternativas à equipe. Não diga que consultou, reservou ou agendou.`;

/** Somente as duas descrições factuais canônicas ficam fora do limite de ofertas; o restante segue validado. */
export function withoutSbcAttendanceDescriptions(text: string) {
  const normalize = (value: string) => value.normalize("NFKD").replace(/\p{Diacritic}|\p{Cf}/gu, "").toLowerCase();
  let result = text;
  for (const description of [SBC_WEEKDAY_ATTENDANCE, SBC_SATURDAY_ATTENDANCE]) {
    const sentence = normalize(description).replace(/[.,]/gu, "").replace(/\s+/gu, " ").trim();
    const pattern = sentence.split(" ").map((word) => word.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")).join("[,\\s]+");
    result = result.replace(new RegExp(`(^|[.!?]\\s*)${pattern}(?=[.!?,;\\s]|$)`, "gu"), "$1");
  }
  return result;
}
