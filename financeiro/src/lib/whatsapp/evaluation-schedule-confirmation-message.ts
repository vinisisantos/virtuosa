import { renderTemplateVariables } from "#lib/whatsapp/message-template";

export const LEADS_OSASCO_INSTANCE_ID = "d1385a2c-e4e9-4822-8125-c693edf9ef3d";
export const LEADS_OSASCO_UNIT = "Osasco";
export const LEADS_SBC_INSTANCE_ID = "a6871ee7-8352-4b66-bfb2-b8dba9e4f8e3";
export const LEADS_SCS_INSTANCE_ID = "bbb24b4e-ef6d-4b64-93e8-9998d0514c65";
export const EVALUATION_SCHEDULED_AUTOMATION_TRIGGER = "evaluation_scheduled";
export const EVALUATION_CONFIRMATION_REQUEST_AUTOMATION_TRIGGER = "evaluation_confirmation_request";

export const DEFAULT_EVALUATION_SCHEDULE_CONFIRMATION_TEMPLATE = [
  "{{nome}} sua avaliação ficou agendada para *{{dia_da_semana}}*, *{{data}}*, às *{{hora}}*. 🗓️✨",
  "",
  "📍 Rua Eloy Cândido Lopes, 61 — Centro, Osasco",
  "Localização: https://share.google/1an6GRqskaNzqcsPJ",
  "24h antes será enviado uma mensagem de confirmação do seu agendamento.",
  "",
  "Estaremos esperando por você. Será um prazer receber você na *Clínica Virtuosa Osasco*! 🌸",
].join("\n");

export const DEFAULT_EVALUATION_CONFIRMATION_REQUEST_TEMPLATE = [
  "Olá, *{{nome}}*! 💗",
  "",
  "Passando para confirmar a sua avaliação de amanhã na *Clínica Virtuosa Osasco*, às *{{hora}}*. 🗓️✨",
  "",
  "Esse momento é muito importante para que nossa especialista consiga entender melhor os seus objetivos, avaliar a região com atenção e indicar o tratamento mais adequado para você. 🌸",
  "",
  "📍 Rua Eloy Cândido Lopes, 61 — Centro, Osasco",
  "Localização: https://share.google/uwnrFMCt4re3TqvXI",
  "",
  "*Podemos confirmar a sua presença?* 💕",
].join("\n");

export const DEFAULT_SBC_EVALUATION_SCHEDULE_CONFIRMATION_TEMPLATE = [
  "{{nome}} sua avaliação ficou agendada para *{{dia_da_semana}}*, *{{data}}*, às *{{hora}}*. 🗓️✨",
  "",
  "📍 Avenida das Nações Unidas, 30 — Jardim do Mar, São Bernardo do Campo",
  "Localização: https://www.google.com/maps/search/?api=1&query=Avenida+das+Na%C3%A7%C3%B5es+Unidas%2C+30%2C+S%C3%A3o+Bernardo+do+Campo+SP",
  "24h antes será enviado uma mensagem de confirmação do seu agendamento.",
  "",
  "Estaremos esperando por você. Será um prazer receber você na *Clínica Virtuosa São Bernardo*! 🌸",
].join("\n");

export const DEFAULT_SBC_EVALUATION_CONFIRMATION_REQUEST_TEMPLATE = [
  "Olá, *{{nome}}*! 💗",
  "",
  "Passando para confirmar a sua avaliação de amanhã na *Clínica Virtuosa São Bernardo*, às *{{hora}}*. 🗓️✨",
  "",
  "Esse momento é muito importante para que nossa especialista consiga entender melhor os seus objetivos, avaliar a região com atenção e indicar o tratamento mais adequado para você. 🌸",
  "",
  "📍 Avenida das Nações Unidas, 30 — Jardim do Mar, São Bernardo do Campo",
  "Localização: https://www.google.com/maps/search/?api=1&query=Avenida+das+Na%C3%A7%C3%B5es+Unidas%2C+30%2C+S%C3%A3o+Bernardo+do+Campo+SP",
  "",
  "*Podemos confirmar a sua presença?* 💕",
].join("\n");

export const DEFAULT_SCS_EVALUATION_SCHEDULE_CONFIRMATION_TEMPLATE = [
  "{{nome}} sua avaliação ficou agendada para *{{dia_da_semana}}*, *{{data}}*, às *{{hora}}*. 🗓️✨",
  "",
  "📍 Avenida Vital Brasil Filho, 143 — Osvaldo Cruz, São Caetano do Sul",
  "Localização: https://www.google.com/maps/search/?api=1&query=Avenida+Vital+Brasil+Filho%2C+143%2C+S%C3%A3o+Caetano+do+Sul+SP",
  "24h antes será enviado uma mensagem de confirmação do seu agendamento.",
  "",
  "Estaremos esperando por você. Será um prazer receber você na *Clínica Virtuosa São Caetano*! 🌸",
].join("\n");

export const DEFAULT_SCS_EVALUATION_CONFIRMATION_REQUEST_TEMPLATE = [
  "Olá, *{{nome}}*! 💗",
  "",
  "Passando para confirmar a sua avaliação de amanhã na *Clínica Virtuosa São Caetano*, às *{{hora}}*. 🗓️✨",
  "",
  "Esse momento é muito importante para que nossa especialista consiga entender melhor os seus objetivos, avaliar a região com atenção e indicar o tratamento mais adequado para você. 🌸",
  "",
  "📍 Avenida Vital Brasil Filho, 143 — Osvaldo Cruz, São Caetano do Sul",
  "Localização: https://www.google.com/maps/search/?api=1&query=Avenida+Vital+Brasil+Filho%2C+143%2C+S%C3%A3o+Caetano+do+Sul+SP",
  "",
  "*Podemos confirmar a sua presença?* 💕",
].join("\n");

export type EvaluationScheduleUnit = "Osasco" | "SBC" | "SCS";

export type EvaluationScheduleUnitConfig = {
  unit: EvaluationScheduleUnit;
  instanceId: string;
  instanceDisplayName: string;
  clinicName: string;
  scheduledTemplate: string;
  confirmationRequestTemplate: string;
};

export const EVALUATION_SCHEDULE_UNIT_CONFIGS: readonly EvaluationScheduleUnitConfig[] = [
  {
    unit: LEADS_OSASCO_UNIT,
    instanceId: LEADS_OSASCO_INSTANCE_ID,
    instanceDisplayName: "Leads Osasco",
    clinicName: "Clínica Virtuosa Osasco",
    scheduledTemplate: DEFAULT_EVALUATION_SCHEDULE_CONFIRMATION_TEMPLATE,
    confirmationRequestTemplate: DEFAULT_EVALUATION_CONFIRMATION_REQUEST_TEMPLATE,
  },
  {
    unit: "SBC",
    instanceId: LEADS_SBC_INSTANCE_ID,
    instanceDisplayName: "Leads - Paloma",
    clinicName: "Clínica Virtuosa São Bernardo",
    scheduledTemplate: DEFAULT_SBC_EVALUATION_SCHEDULE_CONFIRMATION_TEMPLATE,
    confirmationRequestTemplate: DEFAULT_SBC_EVALUATION_CONFIRMATION_REQUEST_TEMPLATE,
  },
  {
    unit: "SCS",
    instanceId: LEADS_SCS_INSTANCE_ID,
    instanceDisplayName: "Thais Amorim Leads",
    clinicName: "Clínica Virtuosa São Caetano",
    scheduledTemplate: DEFAULT_SCS_EVALUATION_SCHEDULE_CONFIRMATION_TEMPLATE,
    confirmationRequestTemplate: DEFAULT_SCS_EVALUATION_CONFIRMATION_REQUEST_TEMPLATE,
  },
];

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

export function getEvaluationScheduleUnitConfig(params: {
  unit?: string | null;
  instanceId?: string | null;
}) {
  return EVALUATION_SCHEDULE_UNIT_CONFIGS.find((config) => (
    config.unit === params.unit && config.instanceId === params.instanceId
  )) || null;
}

export function getEvaluationScheduleUnitConfigByUnit(unit?: string | null) {
  return EVALUATION_SCHEDULE_UNIT_CONFIGS.find((config) => config.unit === unit) || null;
}

export function isEvaluationScheduleInstanceId(instanceId?: string | null) {
  return EVALUATION_SCHEDULE_UNIT_CONFIGS.some((config) => config.instanceId === instanceId);
}

function buildEvaluationMessage(params: {
  unit: EvaluationScheduleUnit;
  clientName: string;
  startTime: Date;
  template: string;
}) {
  const clientName = params.clientName.trim();
  const weekday = weekdayFormatter.format(params.startTime);
  const date = dateFormatter.format(params.startTime);
  const time = timeFormatter.format(params.startTime);
  return renderTemplateVariables(params.template, {
    nome: clientName,
    nome_completo: clientName,
    primeiro_nome: clientName.split(/\s+/)[0] || clientName,
    dia_da_semana: weekday,
    data: date,
    hora: time,
    unidade: params.unit,
  });
}

export function buildEvaluationScheduleConfirmationMessage(params: {
  unit: EvaluationScheduleUnit;
  clientName: string;
  startTime: Date;
  template?: string | null;
}) {
  const config = getEvaluationScheduleUnitConfigByUnit(params.unit);
  if (!config) throw new Error(`Unidade sem automação de agendamento: ${params.unit}`);

  return buildEvaluationMessage({
    unit: params.unit,
    clientName: params.clientName,
    startTime: params.startTime,
    template: params.template?.trim() || config.scheduledTemplate,
  });
}

export function buildEvaluationConfirmationRequestMessage(params: {
  unit: EvaluationScheduleUnit;
  clientName: string;
  startTime: Date;
  template?: string | null;
}) {
  const config = getEvaluationScheduleUnitConfigByUnit(params.unit);
  if (!config) throw new Error(`Unidade sem automação de confirmação: ${params.unit}`);

  return buildEvaluationMessage({
    unit: params.unit,
    clientName: params.clientName,
    startTime: params.startTime,
    template: params.template?.trim() || config.confirmationRequestTemplate,
  });
}

export function getEvaluationScheduleAutomationMessage(steps: unknown) {
  if (!Array.isArray(steps)) return null;

  for (const step of steps) {
    if (!step || typeof step !== "object") continue;
    const candidate = step as { type?: unknown; config?: unknown };
    if (candidate.type !== "send_message" || !candidate.config || typeof candidate.config !== "object") continue;
    const message = (candidate.config as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message.trim();
  }

  return null;
}
