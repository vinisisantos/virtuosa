import assert from "node:assert/strict";
import test from "node:test";

import {
  LEADS_OSASCO_INSTANCE_ID,
  buildLeadsOsascoScheduleConfirmationMessage,
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
