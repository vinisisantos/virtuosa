import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_EVALUATION_CONFIRMATION_REQUEST_TEMPLATE,
  DEFAULT_EVALUATION_DAY_REMINDER_TEMPLATE,
  DEFAULT_EVALUATION_NO_SHOW_TEMPLATE,
  DEFAULT_EVALUATION_RESCHEDULED_TEMPLATE,
  DEFAULT_EVALUATION_SCHEDULE_CONFIRMATION_TEMPLATE,
  LEADS_OSASCO_INSTANCE_ID,
  LEADS_SBC_INSTANCE_ID,
  LEADS_SCS_INSTANCE_ID,
  buildEvaluationConfirmationRequestMessage,
  buildEvaluationDayReminderMessage,
  buildEvaluationNoShowMessage,
  buildEvaluationRescheduledMessage,
  buildEvaluationScheduleConfirmationMessage,
  getEvaluationScheduleUnitConfig,
  getEvaluationScheduleAutomationMessage,
} from "../src/lib/whatsapp/evaluation-schedule-confirmation-message.ts";
import {
  DEFAULT_EVALUATION_CONFIRMATION_WINDOW_HOURS,
  EVALUATION_CONFIRMATION_WINDOW_MS,
  evaluationConfirmationWindow,
  normalizeEvaluationConfirmationWindowHours,
} from "../src/lib/whatsapp/evaluation-confirmation-window.ts";
import {
  EVALUATION_DAY_REMINDER_MANUAL_EARLIEST_HOUR,
  EVALUATION_DAY_REMINDER_MANUAL_HOURS_BEFORE,
  evaluationDayReminderWindow,
} from "../src/lib/whatsapp/evaluation-day-reminder-window.ts";

test("confirmação mantém os parágrafos e formata a agenda de Osasco", () => {
  const message = buildEvaluationScheduleConfirmationMessage({
    unit: "Osasco",
    clientName: "Maria",
    startTime: new Date("2026-08-10T13:30:00.000Z"),
  });

  assert.equal(message, [
    "Maria sua avaliação ficou agendada para *segunda-feira*, *10/08/2026*, às *10:30*. 🗓️✨",
    "",
    "📍 Rua Eloy Cândido Lopes, 61 — Centro, Osasco",
    "Localização: https://share.google/1an6GRqskaNzqcsPJ",
    "24h antes será enviado uma mensagem de confirmação do seu agendamento.",
    "",
    "Estaremos esperando por você. Será um prazer receber você na *Clínica Virtuosa Osasco*! 🌸",
  ].join("\n"));
});

test("confirmação fica restrita à caixa de leads da própria unidade", () => {
  assert.equal(getEvaluationScheduleUnitConfig({
    unit: "Osasco",
    instanceId: LEADS_OSASCO_INSTANCE_ID,
  })?.unit, "Osasco");
  assert.equal(getEvaluationScheduleUnitConfig({
    unit: "SBC",
    instanceId: LEADS_SBC_INSTANCE_ID,
  })?.unit, "SBC");
  assert.equal(getEvaluationScheduleUnitConfig({
    unit: "SCS",
    instanceId: LEADS_SCS_INSTANCE_ID,
  })?.unit, "SCS");
  assert.equal(getEvaluationScheduleUnitConfig({
    unit: "Osasco",
    instanceId: "outra-instancia",
  }), null);
  assert.equal(getEvaluationScheduleUnitConfig({
    unit: "SCS",
    instanceId: LEADS_OSASCO_INSTANCE_ID,
  }), null);
});

test("mensagem editada na automação substitui os dados da agenda", () => {
  const message = buildEvaluationScheduleConfirmationMessage({
    unit: "Osasco",
    clientName: "Maria da Silva",
    startTime: new Date("2026-08-10T13:30:00.000Z"),
    template: "Olá, {{primeiro_nome}}! Sua avaliação em {{unidade}} será {{dia_da_semana}}, {{data}}, às {{hora}}.",
  });

  assert.equal(
    message,
    "Olá, Maria! Sua avaliação em Osasco será segunda-feira, 10/08/2026, às 10:30.",
  );
});

test("lê somente a primeira mensagem válida dos passos da automação", () => {
  assert.equal(getEvaluationScheduleAutomationMessage([
    { type: "wait", config: { seconds: 10 } },
    { type: "send_message", config: { message: "  Mensagem editada {{nome}}  " } },
    { type: "send_message", config: { message: "Ignorada" } },
  ]), "Mensagem editada {{nome}}");
  assert.equal(getEvaluationScheduleAutomationMessage([
    { type: "send_message", config: { message: " " } },
  ]), null);
});

test("template padrão continua sendo a mensagem já publicada", () => {
  assert.match(DEFAULT_EVALUATION_SCHEDULE_CONFIRMATION_TEMPLATE, /\{\{nome\}\}/);
  assert.match(DEFAULT_EVALUATION_SCHEDULE_CONFIRMATION_TEMPLATE, /Rua Eloy Cândido Lopes/);
});

test("agendamento de SBC usa endereço e identidade de São Bernardo", () => {
  const message = buildEvaluationScheduleConfirmationMessage({
    unit: "SBC",
    clientName: "Ana",
    startTime: new Date("2026-08-10T13:30:00.000Z"),
  });

  assert.match(message, /Avenida das Nações Unidas, 30/);
  assert.match(message, /Clínica Virtuosa São Bernardo/);
  assert.match(message, /10\/08\/2026/);
  assert.doesNotMatch(message, /Osasco/);
});

test("agendamento de SCS usa endereço e identidade de São Caetano", () => {
  const message = buildEvaluationScheduleConfirmationMessage({
    unit: "SCS",
    clientName: "Beatriz",
    startTime: new Date("2026-08-10T13:30:00.000Z"),
  });

  assert.match(message, /Avenida Vital Brasil Filho, 143/);
  assert.match(message, /Clínica Virtuosa São Caetano/);
  assert.match(message, /10\/08\/2026/);
  assert.doesNotMatch(message, /Osasco/);
});

test("pedido de confirmação preserva conteúdo, parágrafos, data e horário", () => {
  const message = buildEvaluationConfirmationRequestMessage({
    unit: "Osasco",
    clientName: "Maria da Silva",
    startTime: new Date("2026-08-10T13:30:00.000Z"),
  });

  assert.equal(message, [
    "Olá, *Maria da Silva*! 💗",
    "",
    "Passando para confirmar a sua avaliação na *Clínica Virtuosa Osasco*, no dia *10/08/2026*, às *10:30*. 🗓️✨",
    "",
    "Esse momento é muito importante para que nossa especialista consiga entender melhor os seus objetivos, avaliar a região com atenção e indicar o tratamento mais adequado para você. 🌸",
    "",
    "📍 Rua Eloy Cândido Lopes, 61 — Centro, Osasco",
    "Localização: https://share.google/uwnrFMCt4re3TqvXI",
    "",
    "*Podemos confirmar a sua presença?* 💕",
  ].join("\n"));
  assert.match(DEFAULT_EVALUATION_CONFIRMATION_REQUEST_TEMPLATE, /\{\{nome\}\}/);
  assert.match(DEFAULT_EVALUATION_CONFIRMATION_REQUEST_TEMPLATE, /\{\{hora\}\}/);
});

test("pedido de confirmação de SCS usa o modelo da própria unidade", () => {
  const message = buildEvaluationConfirmationRequestMessage({
    unit: "SCS",
    clientName: "Carla",
    startTime: new Date("2026-08-10T13:30:00.000Z"),
  });

  assert.match(message, /Olá, \*Carla\*!/);
  assert.match(message, /Clínica Virtuosa São Caetano/);
  assert.match(message, /Vital Brasil Filho, 143/);
  assert.doesNotMatch(message, /Eloy Cândido Lopes/);
});

test("pedido de confirmação de SBC usa o modelo da própria unidade", () => {
  const message = buildEvaluationConfirmationRequestMessage({
    unit: "SBC",
    clientName: "Daniela",
    startTime: new Date("2026-08-10T13:30:00.000Z"),
  });

  assert.match(message, /Olá, \*Daniela\*!/);
  assert.match(message, /Clínica Virtuosa São Bernardo/);
  assert.match(message, /Nações Unidas, 30/);
  assert.doesNotMatch(message, /Eloy Cândido Lopes/);
});

test("mensagem de ausência preserva os parágrafos e substitui o nome", () => {
  const message = buildEvaluationNoShowMessage({
    unit: "Osasco",
    clientName: "Maria da Silva",
    startTime: new Date("2026-08-18T13:30:00.000Z"),
  });

  assert.equal(message, [
    "Oi, Maria da Silva! 😊",
    "",
    "Vimos que você não conseguiu comparecer à sua avaliação de hoje. Aconteceu algum imprevisto?",
    "",
    "Me informe a melhor data que posso *reagendar sua avaliação* para um dia e horário que fique melhor para você. 😊",
    "",
    "Você prefere *durante a semana ou no sábado*?",
  ].join("\n"));
  assert.match(DEFAULT_EVALUATION_NO_SHOW_TEMPLATE, /\{\{nome\}\}/);
});

test("mensagem de ausência editada continua disponível nas três unidades", () => {
  for (const unit of ["Osasco", "SBC", "SCS"]) {
    assert.equal(buildEvaluationNoShowMessage({
      unit,
      clientName: "Ana Souza",
      startTime: new Date("2026-08-18T13:30:00.000Z"),
      template: "Olá, {{primeiro_nome}}. Registramos sua ausência em {{unidade}} às {{hora}}.",
    }), `Olá, Ana. Registramos sua ausência em ${unit} às 10:30.`);
  }
});

test("reagendamento preserva os parágrafos e informa a nova agenda de Osasco", () => {
  const message = buildEvaluationRescheduledMessage({
    unit: "Osasco",
    clientName: "Maria da Silva",
    startTime: new Date("2026-08-24T13:30:00.000Z"),
  });

  assert.equal(message, [
    "Olá, Maria da Silva! 💗",
    "",
    "Sua avaliação foi reagendada para *segunda-feira*, *24/08/2026*, às *10:30*. 🗓️✨",
    "",
    "📍 Clínica Virtuosa Osasco",
    "Rua Eloy Cândido Lopes, 61 — Centro, Osasco",
    "Localização: https://share.google/uwnrFMCt4re3TqvXI",
    "",
    "Estaremos esperando por você. Será um prazer receber você! 🌸",
  ].join("\n"));
  assert.match(DEFAULT_EVALUATION_RESCHEDULED_TEMPLATE, /\{\{dia_da_semana\}\}/);
  assert.match(DEFAULT_EVALUATION_RESCHEDULED_TEMPLATE, /\{\{link_localizacao\}\}/);
});

test("reagendamento usa identidade, endereço e link da própria unidade", () => {
  const cases = [
    ["SBC", "São Bernardo", "Avenida das Nações Unidas, 30"],
    ["SCS", "São Caetano", "Avenida Vital Brasil Filho, 143"],
  ];

  for (const [unit, displayName, address] of cases) {
    const message = buildEvaluationRescheduledMessage({
      unit,
      clientName: "Ana",
      startTime: new Date("2026-08-24T13:30:00.000Z"),
    });
    assert.match(message, new RegExp(`Clínica Virtuosa ${displayName}`));
    assert.match(message, new RegExp(address));
    assert.doesNotMatch(message, /Eloy Cândido Lopes/);
  }
});

test("reagendamento editado continua substituindo todas as variáveis", () => {
  const message = buildEvaluationRescheduledMessage({
    unit: "SCS",
    clientName: "Ana Souza",
    startTime: new Date("2026-08-24T13:30:00.000Z"),
    template: "{{primeiro_nome}}, reagendamos em {{unidade}} para {{data}} às {{hora}}. {{endereco}} {{link_localizacao}}",
  });

  assert.match(message, /^Ana, reagendamos em São Caetano para 24\/08\/2026 às 10:30\./);
  assert.match(message, /Avenida Vital Brasil Filho, 143/);
  assert.match(message, /google\.com\/maps/);
});

test("lembrete no dia preserva o texto aprovado e os dados de Osasco", () => {
  const message = buildEvaluationDayReminderMessage({
    unit: "Osasco",
    clientName: "Maria da Silva",
    startTime: new Date("2026-08-19T16:30:00.000Z"),
  });

  assert.equal(message, [
    "Olá, Maria da Silva!",
    "",
    "Passando para lembrar que sua avaliação na Clínica Virtuosa Osasco será hoje, às 13:30. 🗓️✨",
    "",
    "Estamos preparando tudo para receber você com muito carinho. 🌸",
    "",
    "📍 Rua Eloy Cândido Lopes, 61 — Centro, Osasco",
    "Localização: https://share.google/uwnrFMCt4re3TqvXI",
    "",
    "Estamos esperando por você!",
  ].join("\n"));
  assert.match(DEFAULT_EVALUATION_DAY_REMINDER_TEMPLATE, /\{\{endereco\}\}/);
  assert.match(DEFAULT_EVALUATION_DAY_REMINDER_TEMPLATE, /\{\{link_localizacao\}\}/);
});

test("lembrete no dia usa nome, endereço e localização da própria unidade", () => {
  const cases = [
    ["SBC", "São Bernardo", "Avenida das Nações Unidas, 30"],
    ["SCS", "São Caetano", "Avenida Vital Brasil Filho, 143"],
  ];

  for (const [unit, displayName, address] of cases) {
    const message = buildEvaluationDayReminderMessage({
      unit,
      clientName: "Ana",
      startTime: new Date("2026-08-19T16:30:00.000Z"),
    });
    assert.match(message, new RegExp(`Clínica Virtuosa ${displayName}`));
    assert.match(message, new RegExp(address));
    assert.doesNotMatch(message, /Eloy Cândido Lopes/);
  }
});

test("lembrete abre duas horas antes e nunca antes das 8h de São Paulo", () => {
  const afternoonStart = new Date("2026-08-19T16:30:00.000Z");
  assert.equal(evaluationDayReminderWindow({
    startTime: afternoonStart,
    now: new Date("2026-08-19T14:29:59.999Z"),
  }).state, "too_early");
  assert.equal(evaluationDayReminderWindow({
    startTime: afternoonStart,
    now: new Date("2026-08-19T14:30:00.000Z"),
  }).state, "available");

  const morningStart = new Date("2026-08-19T12:00:00.000Z");
  const window = evaluationDayReminderWindow({
    startTime: morningStart,
    now: new Date("2026-08-19T11:00:00.000Z"),
  });
  assert.equal(window.state, "available");
  assert.equal(window.reminderAt.toISOString(), "2026-08-19T11:00:00.000Z");
});

test("lembrete não envia em outro dia nem depois do horário da avaliação", () => {
  const startTime = new Date("2026-08-19T16:30:00.000Z");
  assert.equal(evaluationDayReminderWindow({
    startTime,
    now: new Date("2026-08-18T16:30:00.000Z"),
  }).state, "not_today");
  assert.equal(evaluationDayReminderWindow({
    startTime,
    now: startTime,
  }).state, "expired");
});

test("lembrete manual abre dez horas antes e permanece restrito ao dia da avaliação", () => {
  const startTime = new Date("2026-08-19T16:30:00.000Z");
  const params = {
    startTime,
    hoursBefore: EVALUATION_DAY_REMINDER_MANUAL_HOURS_BEFORE,
    earliestHour: EVALUATION_DAY_REMINDER_MANUAL_EARLIEST_HOUR,
  };

  assert.equal(evaluationDayReminderWindow({
    ...params,
    now: new Date("2026-08-19T06:29:59.999Z"),
  }).state, "too_early");
  assert.equal(evaluationDayReminderWindow({
    ...params,
    now: new Date("2026-08-19T06:30:00.000Z"),
  }).state, "available");
  assert.equal(evaluationDayReminderWindow({
    ...params,
    now: new Date("2026-08-18T23:30:00.000Z"),
  }).state, "not_today");
});

test("janela de confirmação abre exatamente 72h antes e fecha no horário", () => {
  const startTime = new Date("2026-08-12T13:30:00.000Z");
  const eligibleAt = new Date(startTime.getTime() - EVALUATION_CONFIRMATION_WINDOW_MS);

  assert.equal(evaluationConfirmationWindow({
    startTime,
    now: new Date(eligibleAt.getTime() - 1),
  }).state, "too_early");
  assert.equal(evaluationConfirmationWindow({ startTime, now: eligibleAt }).state, "available");
  assert.equal(evaluationConfirmationWindow({
    startTime,
    now: new Date(startTime.getTime() - 1),
  }).state, "available");
  assert.equal(evaluationConfirmationWindow({ startTime, now: startTime }).state, "expired");
});

test("janela de confirmação aceita uma antecedência configurada acima de 72h", () => {
  const startTime = new Date("2026-08-12T13:30:00.000Z");
  const eligibleAt = new Date(startTime.getTime() - 96 * 60 * 60 * 1000);

  assert.equal(evaluationConfirmationWindow({
    startTime,
    windowHours: 96,
    now: new Date(eligibleAt.getTime() - 1),
  }).state, "too_early");
  assert.equal(evaluationConfirmationWindow({
    startTime,
    windowHours: 96,
    now: eligibleAt,
  }).state, "available");
});

test("antecedência inválida ou menor que 72h volta ao mínimo seguro", () => {
  assert.equal(normalizeEvaluationConfirmationWindowHours(undefined), DEFAULT_EVALUATION_CONFIRMATION_WINDOW_HOURS);
  assert.equal(normalizeEvaluationConfirmationWindowHours("inválido"), DEFAULT_EVALUATION_CONFIRMATION_WINDOW_HOURS);
  assert.equal(normalizeEvaluationConfirmationWindowHours(0), 72);
  assert.equal(normalizeEvaluationConfirmationWindowHours(24), 72);
  assert.equal(normalizeEvaluationConfirmationWindowHours(500), 168);
});
