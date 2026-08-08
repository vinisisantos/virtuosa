export const LEADS_OSASCO_INSTANCE_ID = "d1385a2c-e4e9-4822-8125-c693edf9ef3d";
export const LEADS_OSASCO_UNIT = "Osasco";

const SCHEDULE_TIME_ZONE = "America/Sao_Paulo";

const weekdayFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: SCHEDULE_TIME_ZONE,
  weekday: "long",
});

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: SCHEDULE_TIME_ZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const timeFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: SCHEDULE_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function shouldSendLeadsOsascoScheduleConfirmation(params: {
  unit?: string | null;
  instanceId?: string | null;
}) {
  return params.unit === LEADS_OSASCO_UNIT && params.instanceId === LEADS_OSASCO_INSTANCE_ID;
}

export function buildLeadsOsascoScheduleConfirmationMessage(params: {
  clientName: string;
  startTime: Date;
}) {
  const clientName = params.clientName.trim();
  const weekday = weekdayFormatter.format(params.startTime);
  const date = dateFormatter.format(params.startTime);
  const time = timeFormatter.format(params.startTime);

  return [
    `${clientName} sua avaliação ficou agendada para *${weekday}*, *${date}*, às *${time}*. 🗓️✨`,
    "",
    "📍 Rua Eloy Cândido Lopes, 61 — Centro, Osasco",
    "Localização: https://share.google/1an6GRqskaNzqcsPJ",
    "24h antes será enviado uma mensagem de confirmação do seu agendamento.",
    "",
    "Estaremos esperando por você. Será um prazer receber você na *Clínica Virtuosa Osasco*! 🌸",
  ].join("\n");
}
