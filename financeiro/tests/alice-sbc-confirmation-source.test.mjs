import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

function fixture({ instanceUnit = "SBC", contactUnit = "SBC", contactPhone = "5511999999999" } = {}) {
  const calls = [];
  const prisma = {
    automation: { findFirst: async () => null },
    whatsAppConversation: { findFirst: async () => ({ id: "conversation", lastKnownJid: null, contact: { phone: contactPhone, unit: contactUnit } }) },
  };
  const config = { unit: "SBC", scheduledTemplate: "mensagem" };
  const modules = {
    "@/lib/db": { prisma },
    "@/lib/phone": { phoneLookupKey: (phone) => phone?.replace(/\D/g, "").slice(-11) || null },
    "@/lib/whatsapp/instance-resolver": { getInstancesForRequest: async () => ({ instances: [{ id: "other-sbc", unit: instanceUnit, status: "connected", canReply: true, name: "teste" }] }) },
    "@/lib/whatsapp/automation-sender": { sendAutomationText: async (input) => { calls.push(input); } },
    "@/lib/whatsapp/evaluation-schedule-confirmation-message": {
      EVALUATION_SCHEDULED_AUTOMATION_TRIGGER: "evaluation_scheduled",
      buildEvaluationScheduleConfirmationMessage: () => "Confirmação fictícia",
      getEvaluationScheduleUnitConfig: () => null,
      getEvaluationScheduleUnitConfigByUnit: (unit) => unit === "SBC" ? config : null,
      getEvaluationScheduleAutomationMessage: () => null,
    },
  };
  const source = readFileSync(new URL("../src/lib/whatsapp/evaluation-schedule-confirmation.ts", import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, console, require: (id) => { assert.ok(modules[id], `dependência não simulada: ${id}`); return modules[id]; } });
  const params = { request: {}, unit: "SBC", instanceId: "other-sbc", conversationId: "conversation", clientName: "Cliente Teste", clientPhone: "5511999999999", startTime: new Date("2026-11-09T13:00:00Z") };
  return { run: (changes = {}) => exports.sendEvaluationScheduleConfirmation({ ...params, ...changes }), calls };
}

test("caixa adicional só envia quando a exceção SBC é solicitada explicitamente", async () => {
  const f = fixture();
  assert.equal((await f.run()).status, "not_applicable");
  assert.equal(f.calls.length, 0);
  assert.equal((await f.run({ allowAuthorizedSbcInstance: true, requireProviderMessageId: true })).status, "sent");
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].requireProviderMessageId, true);
});

test("não permite caixa de outra unidade, contato de outra unidade em caixa compartilhada ou telefone divergente", async () => {
  for (const options of [{ instanceUnit: "Osasco" }, { instanceUnit: "Todas", contactUnit: "Osasco" }, { contactPhone: "5511888888888" }]) {
    const f = fixture(options);
    assert.equal((await f.run({ allowAuthorizedSbcInstance: true })).status, "failed");
    assert.equal(f.calls.length, 0);
  }
});
