import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import * as autonomyPolicy from "../src/lib/ai-assistant/autonomy/policy.ts";
import * as assistantPolicy from "../src/lib/ai-assistant/policy.ts";
import { buildSbcEvaluationOptions, deriveSbcEvaluationChoice } from "#lib/ai-assistant/sbc-scheduling-policy";

function fixture(options = {}) {
  const now = Date.now();
  const slot = buildSbcEvaluationOptions(new Date(now))[0];
  const [date, time] = slot.split("T");
  const [year, month, day] = date.split("-");
  const [hour, minute] = time.split(":");
  const activation = JSON.stringify({ enabled: true, activatedAt: new Date(now - 60_000).toISOString() });
  const offer = { id: "offer", body: `Podemos agendar em ${day}/${month}/${year} às ${hour}h${minute}?`, fromMe: true, status: "delivered", timestamp: new Date(now - 30_000), createdAt: new Date(now - 30_000) };
  const reply = { id: "reply", body: "Pode ser", fromMe: false, status: "read", timestamp: new Date(now - 10_000), createdAt: new Date(now - 10_000) };
  const state = { ledger: null, appointment: null, sent: 0, updates: 0, locks: [], after: [], groupNotices: [], appointmentInput: null };
  const deal = { id: "deal", clientId: "client", clientName: "Cliente Teste", unit: "SBC", stage: options.stage || "novo_lead", commercialStatus: null, pipelineId: "pipeline", updatedAt: new Date(now - 100_000), notes: null };
  const tx = {
    $queryRaw: async (strings) => {
      const query = strings.join("?"); state.locks.push(query);
      if (query.includes('"WhatsAppConversation"')) return [{ instanceId: options.autonomy ? autonomyPolicy.ALICE_AUTONOMY_INSTANCE_ID : "sbc-instance", contactId: "contact", aiMode: options.humanTakeover ? "manual" : options.autonomy ? "agent" : "suggestions", blockedAt: null, archivedAt: null, status: "open" }];
      if (query.includes('"AliceAutonomousTurn"')) {
        assert.match(query, /"claimedAt">=NOW\(\)/);
        return options.expiredLease ? [] : [{ id: "turn" }];
      }
      if (query.includes('"WhatsAppInstance"')) return [{ unit: "SBC" }];
      if (query.includes('"WhatsAppContact"')) return [{ phone: "5511999999999", unit: "SBC" }];
      if (query.includes('"Client"')) return [{ name: "Cliente Teste", phone: "5511999999999", unit: "SBC", isActive: true, campaignName: options.changedCampaign ? "Outra campanha" : options.campaignName || null }];
      if (query.includes('"AppSetting"') && query.includes('"key", "value"')) return [
        { key: autonomyPolicy.ALICE_AUTONOMY_CONFIG_KEY, value: JSON.stringify({ enabled: !options.pausedAutonomy, instanceId: autonomyPolicy.ALICE_AUTONOMY_INSTANCE_ID, activatedAt: new Date(now - 60_000).toISOString() }) },
        { key: assistantPolicy.AI_ASSISTANT_CONFIG_KEY, value: JSON.stringify({ enabled: !options.pausedAssistant }) },
      ];
      if (query.includes('"AppSetting"')) return [{ value: options.changedActivation ? "{}" : activation }];
      throw new Error(`unexpected SQL ${query}`);
    },
    whatsAppMessage: { findFirst: async (query) => query.where.id ? (options.changedCampaignMessage ? null : { id: query.where.id }) : ({ id: options.newMedia ? "new-audio" : reply.id }), findMany: async () => options.changedMessage ? [reply, { ...offer, id: "different" }] : [reply, offer] },
    aliceAutoSchedule: {
      findUnique: async () => state.ledger,
      create: async ({ data }) => { state.ledger = data; return data; },
    },
    agendamento: { findFirst: async () => options.existingAppointment || state.appointment },
    salesPipeline: { updateMany: async () => { state.updates++; return { count: 1 }; } },
    client: { updateMany: async () => ({ count: 1 }) },
  };
  let transactionTail = Promise.resolve();
  const prisma = {
    appSetting: { findUnique: async () => ({ value: options.disabled ? JSON.stringify({ enabled: false }) : activation }) },
    client: { findMany: async () => options.noClient ? [] : [{ id: "client", name: "Cliente Teste", phone: "5511999999999", campaignName: options.campaignName || null }] },
    salesPipeline: { findMany: async () => [deal] },
    pipeline: { findUnique: async () => ({ stages: [{ id: "stage", name: "Agendado" }] }) },
    aliceAutoSchedule: { updateMany: async ({ data }) => { state.ledger.state = data.state; return { count: 1 }; } },
    $transaction: async (fn) => {
      const previous = transactionTail; let release;
      transactionTail = new Promise((resolve) => { release = resolve; });
      await previous;
      try { return await fn(tx); } finally { release(); }
    },
  };
  class NextResponse {}
  const modules = {
    "@/lib/ai-assistant/autonomy/policy": autonomyPolicy,
    "@/lib/ai-assistant/policy": assistantPolicy,
    "@/lib/ai-assistant/autonomy/booking-authorization": { validateAliceBookingClaim: async () => options.claimValid !== false },
    "next/server": { NextResponse, after: (fn) => state.after.push(fn) },
    "@/lib/db": { prisma },
    "@/lib/unit-guard": { requireUnitGuard: () => ({ userName: "Operadora", enforceUnit: () => {} }) },
    "@/lib/phone": { phoneLookupKey: (phone) => phone?.replace(/\D/g, "").slice(-11) || null },
    "@/lib/appointment-client-name": { normalizeAppointmentClientName: (name) => name || null },
    "@/lib/evaluation-scheduling": {
      getEvaluationAssigneeUsers: async () => [{ id: "gabriela", name: "Gabriela Anselmo" }],
      pipelineEvaluationMarker: (id) => `[pipelineDealId:${id}]`,
      upsertPipelineEvaluationAppointment: async (input) => {
        state.appointmentInput = input;
        state.appointment = { id: "appointment", startTime: input.startTime, evaluationGroupNoticeId: options.groupNoticeId || null };
        return state.appointment;
      },
    },
    "@/lib/pipeline-owner-scope": { canAccessPipelineDeal: async () => !options.noPermission, resolvePipelineOwnerScope: async () => ({}) },
    "@/lib/pipeline/procedure-audit": { getPipelineProcedureSelections: async () => new Map([["deal", options.noProcedure ? [] : ["Botox"]]]) },
    "@/lib/pipeline/procedure-names": { formatProcedureNames: (names) => names.join(", ") },
    "@/lib/evaluation-procedure-draft": { evaluationProcedureDraft: ({ campaignName }) => campaignName === "Campanha Desconhecida" ? "" : campaignName || "" },
    "@/lib/pipeline/stages": { pipelineStageKeyFromName: (name) => name.toLowerCase(), isDiscardPipelineStage: (stage) => stage === "perdido" },
    "@/lib/pipeline/commercial-status": { pausesCommercialCallbacks: () => false },
    "@/lib/pipeline/scheduled-stage-events": { recordPipelineScheduledStageEvent: async () => {} },
    "@/lib/whatsapp/evaluation-schedule-confirmation": { sendEvaluationScheduleConfirmation: async () => { state.sent++; return { status: options.sendFails ? "failed" : "sent" }; } },
    "@/lib/whatsapp/evaluation-group-notice": { dispatchEvaluationGroupNotice: async (id) => { state.groupNotices.push(id); } },
    "@/lib/ai-assistant/sbc-scheduling-policy": { deriveSbcEvaluationChoice },
  };
  const source = readFileSync(new URL("../src/lib/ai-assistant/auto-schedule.ts", import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, Date, console, require: (id) => { assert.ok(modules[id], `dependência não simulada: ${id}`); return modules[id]; } });
  const sourceMessage = { ...reply, id: "source", body: options.sourceBody || "Olá, vim pelo Botox Terço Superior", timestamp: new Date(now - 40_000) };
  const params = { req: {}, unit: "SBC", instanceId: options.autonomy ? autonomyPolicy.ALICE_AUTONOMY_INSTANCE_ID : "sbc-instance", instanceUnit: "SBC", contactUnit: "SBC", conversationId: "conversation", phone: "5511999999999", targetMessageId: null, messages: [sourceMessage, offer, reply], safetyHold: false,
    ...(options.autonomy ? { autonomyClaim: { turnId: "turn", claimToken: "claim", sourceMessageId: reply.id } } : {}) };
  return { run: (changes = {}) => exports.tryAliceAutoSchedule({ ...params, ...changes }), state, offer, reply };
}

test("registra uma vez e confirma uma vez mesmo com solicitações concorrentes", async () => {
  const f = fixture();
  const results = await Promise.all([f.run(), f.run()]);
  assert.equal(results.filter((result) => result.status === "booked").length, 1);
  assert.equal(f.state.sent, 1);
  assert.equal(f.state.updates, 1);
  assert.ok(f.state.locks.some((query) => query.includes("FOR UPDATE")));
  assert.ok(f.state.locks.some((query) => query.includes("FOR SHARE")));
});

test("usa campanha registrada apenas quando a cliente a mencionou e os dados não mudaram", async () => {
  const options = { noProcedure: true, campaignName: "Botox Terço Superior" };
  const valid = fixture(options);
  assert.equal((await valid.run()).status, "booked");
  for (const changes of [{ sourceBody: "Quero saber sobre lipo laser" }, { campaignName: "Campanha Desconhecida" }, { changedCampaign: true }, { changedCampaignMessage: true }]) {
    const f = fixture({ ...options, ...changes });
    assert.equal((await f.run()).status, "review");
    assert.equal(f.state.sent, 0);
  }
});

test("falha no envio mantém avaliação e não repete a confirmação", async () => {
  const f = fixture({ sendFails: true });
  const first = await f.run();
  assert.equal(first.status, "booked");
  assert.equal(first.confirmation, "uncertain");
  assert.equal((await f.run()).status, "review");
  assert.equal(f.state.sent, 1);
});

test("não agenda com conversa alterada, avaliação existente ou procedimento ausente", async () => {
  for (const options of [{ changedMessage: true }, { newMedia: true }, { stage: "agendado" }, { stage: "fechado" }, { stage: "perdido" }, { existingAppointment: { id: "previous" } }, { noProcedure: true }, { noClient: true }, { noPermission: true }, { changedActivation: true }]) {
    const f = fixture(options);
    assert.equal((await f.run()).status, "review");
    assert.equal(f.state.sent, 0);
    assert.equal(f.state.appointment, null);
  }
});

test("escopo, desativação e alerta clínico impedem agendamento", async () => {
  for (const changes of [{ unit: "Osasco" }, { instanceUnit: "Osasco" }, { instanceUnit: "Todas", contactUnit: "Osasco" }, { safetyHold: true }]) {
    const f = fixture(); assert.equal((await f.run(changes)).status, "not_applicable"); assert.equal(f.state.sent, 0);
  }
  const f = fixture({ disabled: true }); assert.equal((await f.run()).status, "not_applicable"); assert.equal(f.state.sent, 0);
  const old = fixture();
  old.offer.createdAt = new Date(Date.now() - 120_000);
  assert.equal((await old.run()).status, "not_applicable");
  assert.equal(old.state.sent, 0);
});

test("agendamento autônomo é idempotente e relê lease, pausa global e modo humano na escrita", async () => {
  const enabled = fixture({ autonomy: true });
  const results = await Promise.all([enabled.run(), enabled.run()]);
  assert.equal(results.filter((result) => result.status === "booked").length, 1);
  assert.equal(enabled.state.sent, 1);
  for (const changed of [{ claimValid: false }, { expiredLease: true }, { pausedAutonomy: true }, { pausedAssistant: true }, { humanTakeover: true }]) {
    const f = fixture({ autonomy: true, ...changed });
    assert.equal((await f.run()).status, "review", JSON.stringify(changed));
    assert.equal(f.state.sent, 0);
    assert.equal(f.state.appointment, null);
  }
});

test("agendamento da Alice preserva a caixa de origem e dispara um único aviso de grupo após o commit", async () => {
  const f = fixture({ autonomy: true, groupNoticeId: "notice-sbc" });
  const results = await Promise.all([f.run(), f.run()]);
  assert.equal(results.filter((result) => result.status === "booked").length, 1);
  assert.equal(f.state.appointmentInput.sourceInstanceId, autonomyPolicy.ALICE_AUTONOMY_INSTANCE_ID);
  assert.equal(f.state.appointmentInput.assigneeUserId, "gabriela");
  assert.equal(f.state.appointmentInput.evaluationProcedure, "Botox");
  assert.equal(f.state.after.length, 1);
  assert.deepEqual(f.state.groupNotices, [], "nenhum HTTP antes do pós-commit");
  await f.state.after[0]();
  assert.deepEqual(f.state.groupNotices, ["notice-sbc"]);
  assert.equal(f.state.sent, 1, "confirmação individual não se duplica");
});
