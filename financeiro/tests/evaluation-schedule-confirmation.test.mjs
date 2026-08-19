import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_EVALUATION_CONFIRMATION_REQUEST_TEMPLATE,
  DEFAULT_EVALUATION_NO_SHOW_TEMPLATE,
  DEFAULT_EVALUATION_SCHEDULE_CONFIRMATION_TEMPLATE,
  LEADS_OSASCO_INSTANCE_ID,
  LEADS_SBC_INSTANCE_ID,
  LEADS_SCS_INSTANCE_ID,
  buildEvaluationConfirmationRequestMessage,
  buildEvaluationNoShowMessage,
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

test("pedido de confirmação em 48h preserva conteúdo, parágrafos e horário", () => {
  const message = buildEvaluationConfirmationRequestMessage({
    unit: "Osasco",
    clientName: "Maria da Silva",
    startTime: new Date("2026-08-10T13:30:00.000Z"),
  });

  assert.equal(message, [
    "Olá, *Maria da Silva*! 💗",
    "",
    "Passando para confirmar a sua avaliação de amanhã na *Clínica Virtuosa Osasco*, às *10:30*. 🗓️✨",
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

test("janela de confirmação abre exatamente 48h antes e fecha no horário", () => {
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

test("janela de confirmação respeita a antecedência configurada", () => {
  const startTime = new Date("2026-08-12T13:30:00.000Z");
  const eligibleAt = new Date(startTime.getTime() - 24 * 60 * 60 * 1000);

  assert.equal(evaluationConfirmationWindow({
    startTime,
    windowHours: 24,
    now: new Date(eligibleAt.getTime() - 1),
  }).state, "too_early");
  assert.equal(evaluationConfirmationWindow({
    startTime,
    windowHours: 24,
    now: eligibleAt,
  }).state, "available");
});

test("antecedência inválida volta ao padrão seguro de 48h", () => {
  assert.equal(normalizeEvaluationConfirmationWindowHours(undefined), DEFAULT_EVALUATION_CONFIRMATION_WINDOW_HOURS);
  assert.equal(normalizeEvaluationConfirmationWindowHours("inválido"), DEFAULT_EVALUATION_CONFIRMATION_WINDOW_HOURS);
  assert.equal(normalizeEvaluationConfirmationWindowHours(0), 1);
  assert.equal(normalizeEvaluationConfirmationWindowHours(500), 168);
});
