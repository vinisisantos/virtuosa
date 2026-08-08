import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_EVALUATION_SCHEDULE_CONFIRMATION_TEMPLATE,
  LEADS_OSASCO_INSTANCE_ID,
  buildLeadsOsascoScheduleConfirmationMessage,
  getEvaluationScheduleAutomationMessage,
  shouldSendLeadsOsascoScheduleConfirmation,
} from "../src/lib/whatsapp/evaluation-schedule-confirmation-message.ts";

test("confirmação mantém os parágrafos e formata a agenda de Osasco", () => {
  const message = buildLeadsOsascoScheduleConfirmationMessage({
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

test("confirmação fica restrita à instância Leads Osasco", () => {
  assert.equal(shouldSendLeadsOsascoScheduleConfirmation({
    unit: "Osasco",
    instanceId: LEADS_OSASCO_INSTANCE_ID,
  }), true);
  assert.equal(shouldSendLeadsOsascoScheduleConfirmation({
    unit: "Osasco",
    instanceId: "outra-instancia",
  }), false);
  assert.equal(shouldSendLeadsOsascoScheduleConfirmation({
    unit: "SCS",
    instanceId: LEADS_OSASCO_INSTANCE_ID,
  }), false);
});

test("mensagem editada na automação substitui os dados da agenda", () => {
  const message = buildLeadsOsascoScheduleConfirmationMessage({
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
