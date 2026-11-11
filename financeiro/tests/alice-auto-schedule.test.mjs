import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import * as autonomyPolicy from "../src/lib/ai-assistant/autonomy/policy.ts";
import * as assistantPolicy from "../src/lib/ai-assistant/policy.ts";
import { buildSbcEvaluationOptions } from "#lib/ai-assistant/sbc-scheduling-policy";
import { selectSbcSchedulingExchange } from "#lib/ai-assistant/sbc-scheduling-exchange";
import { projectAliceAudioHistory } from "../src/lib/alice/audio/history.ts";
import { campaignFromPrefilledMetaLeadMessage } from "../src/lib/campaign-track-mapping.ts";

function fixture(options = {}) {
  const now = options.now ? Date.parse(options.now) : Date.now();
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }
  const slot = buildSbcEvaluationOptions(new Date(now))[0];
  const [date, time] = slot.split("T");
  const [year, month, day] = date.split("-");
  const [hour, minute] = time.split(":");
  const activation = JSON.stringify({ enabled: true, activatedAt: new Date(now - 60_000).toISOString() });
  const offer = { id: "offer", body: options.offerBody || `Podemos agendar em ${day}/${month}/${year} às ${hour}h${minute}?`, fromMe: true, status: "delivered", respondedByName: 'Alice', respondedBy: null, timestamp: new Date(now - 30_000), createdAt: new Date(now - 30_000) };
  const reply = { id: "reply", body: options.replyBody || "Pode ser", fromMe: false, status: "read", timestamp: new Date(now - 10_000), createdAt: new Date(now - 10_000) };
  const extraReplies = (options.beforeReply || []).map((body, index) => ({ ...reply, id: `part-${index}`, body, timestamp: new Date(now - 20_000 + index) }));
  const continuation = (options.afterOffer || []).map((message, index) => ({ ...reply, ...message, id: `continuation-${index}`,
    timestamp: new Date(now - 25_000 + index), ...(message.fromMe ? { respondedByName: 'Alice' } : {}) }));
  const sourceMessage = { ...reply, id: "source", body: options.sourceBody || "Olá, vim pelo Botox Terço Superior", timestamp: new Date(now - 40_000) };
  const prior = [sourceMessage, ...(options.beforeOffer || []).map((body, i) => ({ ...sourceMessage, id: `prior-${i}`, body }))];
  const state = { ledger: null, appointment: null, sent: 0, updates: 0, locks: [], after: [], groupNotices: [], appointmentInput: null, confirmationInput: null,
    turnPatch: null, confirmationSawIntent: false };
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
    whatsAppMessage: { findFirst: async (query) => query.where.id ? (options.changedCampaignMessage ? null : { id: query.where.id }) : ({ id: options.newMedia ? "new-audio" : reply.id }), findMany: async () => [
      ...prior,
      options.changedMessage ? { ...offer, id: "different" } : offer,
      ...continuation.map((message) => options.changedContinuation && message.fromMe ? { ...message, respondedByName: 'Operadora' } : message),
      ...extraReplies.map((message) => options.changedPart ? { ...message, body: 'Não quero mais' } : message), reply,
    ].reverse() },
    aliceAutoSchedule: {
      findUnique: async () => state.ledger,
      create: async ({ data }) => { state.ledger = data; return data; },
    },
    aliceAutonomousTurn: { updateMany: async ({ data }) => { state.turnPatch = data; return { count: options.changedClaimAtBooking ? 0 : 1 }; } },
    agendamento: { findFirst: async ({ where }) => {
      assert.equal(where.notes.contains, '[pipelineDealId:deal]', 'consulta não bloqueia o horário ocupado por outra cliente');
      return options.existingAppointment || state.appointment;
    } },
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
      const snapshot = { ledger: state.ledger, appointment: state.appointment, updates: state.updates, turnPatch: state.turnPatch };
      try { return await fn(tx); } catch (error) { Object.assign(state, snapshot); throw error; } finally { release(); }
    },
  };
  class NextResponse {}
  const modules = {
    "@/lib/campaign-track-mapping": { campaignFromPrefilledMetaLeadMessage },
    "@/lib/alice/audio/history": { projectAliceAudioHistory },
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
    "@/lib/whatsapp/evaluation-schedule-confirmation": { sendEvaluationScheduleConfirmation: async (input) => { state.confirmationInput = input; state.sent++;
      state.confirmationSawIntent = state.turnPatch?.messagesJson?.kind === 'booking_followup';
      return { status: options.sendFails ? "failed" : "sent", receipt: { messageId: 'confirmation-provider', messageRowId: 'confirmation-row', sentAt: new Date(now) } }; } },
    "@/lib/whatsapp/evaluation-group-notice": { dispatchEvaluationGroupNotice: async (id) => { state.groupNotices.push(id); } },
    "@/lib/ai-assistant/sbc-scheduling-exchange": { selectSbcSchedulingExchange: (messages, _clock, policy) => selectSbcSchedulingExchange(messages, new Date(now), policy) },
  };
  const source = readFileSync(new URL("../src/lib/ai-assistant/auto-schedule.ts", import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, Date: Clock, console, require: (id) => { assert.ok(modules[id], `dependência não simulada: ${id}`); return modules[id]; } });
  const params = { req: {}, unit: "SBC", instanceId: options.autonomy ? autonomyPolicy.ALICE_AUTONOMY_INSTANCE_ID : "sbc-instance", instanceUnit: "SBC", contactUnit: "SBC", conversationId: "conversation", phone: "5511999999999", targetMessageId: null, messages: [...prior, offer, ...continuation, ...extraReplies, reply], safetyHold: false,
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

const mixedSaturdayOffer = 'Ótimo! No sábado 14/11 temos horários disponíveis das 8h às 13h.\n\nAlgum desses te encaixa melhor?\n\n08h00, 09h00 ou 10h30';

test('aceite coloquial da lista após faixa já enviada registra avaliação, confirmação e aviso uma única vez', async () => {
  const f = fixture({ now: '2026-11-11T19:19:20Z', autonomy: true, groupNoticeId: 'notice',
    campaignName: 'Glúteo Perfeito', noProcedure: true,
    sourceBody: 'Olá! Eu vim pelo GLÚTEOS PERFEITOS, gostaria de saber mais sobre isso.',
    offerBody: mixedSaturdayOffer, replyBody: 'As 10:30 pra mim tá bom' });
  const result = await f.run();
  assert.equal(result.status, 'booked');
  assert.equal(result.startTime, '2026-11-14T13:30:00.000Z');
  assert.equal(f.state.appointmentInput.evaluationProcedure, 'Glúteo Perfeito');
  assert.equal(f.state.sent, 1);
  await f.state.after[0]();
  assert.deepEqual(f.state.groupNotices, ['notice']);
  assert.equal((await f.run()).status, 'review');
  assert.equal(f.state.sent, 1);
});

test('confirmação coloquial mantém o horário explícito na mesma mensagem ou em rajada', async () => {
  for (const parts of [['As 10:30 pra mim tá bom'], ['As 10h30 para mim está bom'],
    ['10h30', 'Pra mim tá bom'], ['10:30 pra mim funciona']]) {
    const f = fixture({ now: '2026-11-11T19:19:20Z', autonomy: true,
      offerBody: 'No sábado 14/11 temos 08h00, 09h00 ou 10h30. Qual prefere?',
      beforeReply: parts.slice(0, -1), replyBody: parts.at(-1) });
    assert.equal((await f.run()).status, 'booked', parts.join(' / '));
    assert.equal(f.state.sent, 1);
  }
});

test('faixa com lista não autoriza horário fora da lista nem aceite coloquial condicionado', async () => {
  for (const text of ['As 13h pra mim tá bom', '9h30 pra mim tá bom', '10h30 pra mim tá bom se eu conseguir',
    '10h30 pra mim tá bom, mas ainda não confirma', '10h30 pra mim tá bom?', '10h30 pra mim tá bom, estou grávida']) {
    const f = fixture({ now: '2026-11-11T19:19:20Z', autonomy: true, offerBody: mixedSaturdayOffer, replyBody: text });
    assert.notEqual((await f.run()).status, 'booked', text);
    assert.equal(f.state.appointment, null);
    assert.equal(f.state.sent, 0);
  }
});

test('a escolha depois do esclarecimento encerra a tentativa ambígua e mantém a oferta original', async () => {
  const f = fixture({ now: '2026-11-11T19:19:20Z', autonomy: true,
    offerBody: 'No sábado 14/11 temos 08h00, 09h00 ou 10h30. Qual prefere?',
    afterOffer: [{ fromMe: false, body: 'Pode ser no horário que tiver?' },
      { fromMe: true, body: 'Para concluir sua avaliação, me confirme o dia e um único horário das opções que te enviei 😊' }],
    replyBody: '14/11 às 10h30 pra mim tá bom' });
  assert.equal((await f.run()).status, 'booked');
  assert.equal(f.state.sent, 1);
});

const carol = { now: '2026-11-10T19:05:55Z', autonomy: true,
  offerBody: 'Ótimo, Carol! Para o sábado, 14/11/2026, tenho esses horários disponíveis: 8h, 8h30, 9h, 9h30, 10h, 10h30, 11h, 11h30, 12h ou 12h30. Qual funciona melhor pra você?',
  afterOffer: [{ body: 'Tem mais fotos pra ver?', fromMe: false },
    { body: 'Fotos de antes e depois a equipe consegue te enviar com mais detalhes. Qual horário do sábado funciona melhor para você?', fromMe: true }],
  beforeReply: ['10h', 'Manda o endereço pra mim por favor', 'Dói muito?'], replyBody: 'Morro de medo de agulha' };

test('perder a claim ao vincular a dúvida aborta a transação antes da confirmação', async () => {
  const f = fixture({ ...carol, changedClaimAtBooking: true });
  assert.equal((await f.run()).status, 'review');
  assert.equal(f.state.appointment, null);
  assert.equal(f.state.ledger, null);
  assert.equal(f.state.updates, 0);
  assert.equal(f.state.sent, 0);
});

test('diálogo completo da Carol cria uma única avaliação e confirmação, preservando dúvidas reais para complemento', async () => {
  const f = fixture(carol);
  const result = await f.run();
  assert.equal(result.status, 'booked');
  assert.equal(result.startTime, '2026-11-14T13:00:00.000Z');
  assert.deepEqual(result.pendingQuestions, ['Dói muito?', 'Morro de medo de agulha']);
  assert.equal(result.confirmationMessage.messageId, 'confirmation-provider');
  assert.equal(f.state.ledger.appointmentId, f.state.appointment.id);
  assert.equal(f.state.sent, 1);
  assert.equal(f.state.confirmationSawIntent, true, 'a pendência foi gravada na mesma transação antes da confirmação externa');
  assert.equal(f.state.updates, 1);
  assert.equal((await f.run()).status, 'review');
  assert.equal(f.state.sent, 1);
});

test('autoria humana surgida na continuação antes da transação impede a reserva da oferta antiga', async () => {
  const f = fixture({ ...carol, changedContinuation: true });
  assert.equal((await f.run()).status, 'review');
  assert.equal(f.state.appointment, null);
  assert.equal(f.state.sent, 0);
});

test('oferta coerente da Neia com escolha e Ok cria só uma avaliação e confirmação', async () => {
  const f = fixture({ now: '2026-11-10T22:52:47Z', autonomy: true,
    offerBody: 'Na quinta (12/11) à noite temos 19h ou 19h30. Qual fica melhor para você?',
    beforeReply: ['19h30'], replyBody: 'Ok' });
  const result = await f.run();
  assert.equal(result.status, 'booked');
  assert.equal(result.startTime, '2026-11-12T22:30:00.000Z');
  assert.deepEqual(result.pendingQuestions, []);
  assert.equal(f.state.sent, 1);
  assert.equal((await f.run()).status, 'review');
  assert.equal(f.state.sent, 1);
});

const schedulingCases = [
  { name: 'primeiro horário após faixa e complemento de trabalho, sem perder campanha comprovada',
    offerBody: 'O próximo sábado disponível é 14/11/2026. Temos horários a partir das 8h até as 13h. Algum horário de preferência?',
    noProcedure: true, campaignName: 'Botox Terço Superior', beforeOffer: ['Gostaria sim de fazer uma avaliação', 'Para mim é melhor de sábado'],
    beforeReply: ['Pode ser no  primeiro horário saio do trabalho e vou direto'], replyBody: 'Trabalho a noite', expected: '2026-11-14T11:00:00.000Z', cost: false },
  { name: 'dia escolhido entre três datas e dúvida complementar',
    offerBody: 'Aqui vão algumas opções à tarde\n09/11 (segunda) às 14h\n10/11 (terça) às 14h\n11/11 (quarta) às 14h\nQual delas fica melhor?',
    beforeReply: ['quarta às 14h'], replyBody: 'Tem algum custo a avaliação?', expected: '2026-11-11T17:00:00.000Z', cost: true },
  { name: 'bom dia separado da escolha entre três horários',
    offerBody: 'Na quarta-feira (11/11) temos horários disponíveis a partir das 13h. Você prefere 13h, 13h30 ou 14h?',
    beforeReply: ['Bom dia'], replyBody: 'As 14 horas', expected: '2026-11-11T17:00:00.000Z', cost: false },
  { name: 'horário no limite da faixa de sábado',
    offerBody: 'No sábado 14/11/2026 temos horários disponíveis das 8h às 13h. Qual horário fica melhor para você?',
    replyBody: 'As 13h', expected: '2026-11-14T16:00:00.000Z', cost: false },
];

for (const sample of schedulingCases) test(`conclui ${sample.name} uma vez, com confirmação e aviso ao grupo`, async () => {
  const f = fixture({ ...sample, now: '2026-11-09T15:00Z', autonomy: true, groupNoticeId: 'notice' });
  const result = await f.run();
  assert.equal(result.status, 'booked');
  assert.equal(result.startTime, sample.expected);
  assert.equal(f.state.ledger.replyMessageId, 'reply', 'origem continua sendo a última entrada real');
  assert.equal(f.state.confirmationInput.evaluationCostQuestion, sample.cost);
  if (sample.campaignName) assert.equal(f.state.appointmentInput.evaluationProcedure, sample.campaignName);
  assert.equal(f.state.sent, 1);
  await f.state.after[0]();
  assert.deepEqual(f.state.groupNotices, ['notice']);
  assert.equal((await f.run()).status, 'review');
  assert.equal(f.state.sent, 1);
});

test('relê todas as partes do aceite e recusa edição, mídia ou retomada antes de salvar', async () => {
  for (const changed of [{ changedPart: true }, { newMedia: true }, { humanTakeover: true }]) {
    const f = fixture({ ...schedulingCases[0], now: '2026-11-09T15:00Z', autonomy: true, ...changed });
    assert.equal((await f.run()).status, 'review');
    assert.equal(f.state.sent, 0);
    assert.equal(f.state.appointment, null);
  }
});

test("usa campanha registrada apenas quando a cliente a mencionou e os dados não mudaram", async () => {
  const options = { noProcedure: true, campaignName: "Botox Terço Superior" };
  const valid = fixture(options);
  assert.equal((await valid.run()).status, "booked");
  for (const changes of [{ sourceBody: "Quero saber sobre lipo laser" }, { campaignName: "Campanha Desconhecida" }, { changedCampaign: true }, { changedCampaignMessage: true },
    { beforeOffer: ["Vim pelo LIPO LASER 699,00, posso ter mais informações sobre isso?", "Prefiro sábado"] },
    { beforeOffer: ["Na verdade não quero mais Botox", "Prefiro sábado"] }]) {
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
