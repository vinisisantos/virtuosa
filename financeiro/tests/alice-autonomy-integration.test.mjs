import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import test from "node:test";
import { activateFixture, database, insertTurn } from "./fixtures/alice-autonomy-database.mjs";
import { runnerFixture } from "./fixtures/alice-autonomy-runner.mjs";
import {
  ALICE_AUTONOMY_INSTANCE_ID,
  aliceAutonomyAvailableAt,
  aliceAutonomyConversationEligible,
  aliceAutonomyCostMicroUsd,
  aliceAutonomyRequiresHumanOwnership,
  aliceRetryableTurnError,
  parseAliceAutonomyConfig,
} from "../src/lib/ai-assistant/autonomy/policy.ts";

globalThis.prisma = {};
globalThis.fetch = async () => { throw new Error("Rede externa proibida neste teste isolado"); };
registerHooks({ resolve(specifier, context, next) {
  if (specifier === "server-only") return { url: "data:text/javascript,export {};", shortCircuit: true };
  if (specifier.startsWith(".") && context.parentURL?.startsWith("file:")) {
    const source = new URL(`${specifier}.ts`, context.parentURL);
    if (existsSync(source)) return next(source.href, context);
  }
  return next(["next/server", "next/headers"].includes(specifier) ? `${specifier}.js` : specifier, context);
} });
const { claimAliceAutonomousTurn, recoverAliceAutonomousTurns, enqueueAliceAutonomousTurn, pauseAliceForHuman } =
  await import("../src/lib/ai-assistant/autonomy/queue.ts");
const { validateAliceAutonomousTurn } = await import("../src/lib/ai-assistant/autonomy/guard.ts");
const { loadAliceAutonomousContext } = await import("../src/lib/ai-assistant/autonomy/context.ts");
const { processAliceAutonomousTurn, runAliceAutonomousBatch } = await import("../src/lib/ai-assistant/autonomy/runner.ts");

test("migração autônoma pode ser reaplicada sem ativar a Alice ou criar mensagens", async () => {
  const { pg, migration } = await database();
  try {
    const initial = await pg.query('SELECT "value" FROM "AppSetting" WHERE "key" = $1', ["alice_autonomous_sbc_v1"]);
    assert.equal(initial.rows.length, 1);
    assert.equal(JSON.parse(initial.rows[0].value).enabled, false);
    const configured = JSON.stringify({ enabled: true, activatedAt: "2026-11-09T03:00:00.000Z", instanceId: "instance-a" });
    await pg.query('UPDATE "AppSetting" SET "value" = $1 WHERE "key" = $2', [configured, "alice_autonomous_sbc_v1"]);
    await insertTurn(pg);
    await pg.exec(migration);
    const repeated = await pg.query('SELECT "value" FROM "AppSetting" WHERE "key" = $1', ["alice_autonomous_sbc_v1"]);
    assert.equal(repeated.rows[0].value, configured);
    assert.deepEqual((await pg.query('SELECT "id", "status" FROM "AliceAutonomousTurn"')).rows, [{ id: "turn-a", status: "queued" }]);
    assert.deepEqual((await pg.query('SELECT count(*)::int AS count FROM "WhatsAppMessage"')).rows, [{ count: 2 }]);
  } finally { await pg.close(); }
});

test("evento repetido não cria segundo turno, mas o mesmo ID do provedor em outra conversa permanece isolado", async () => {
  const { pg } = await database();
  try {
    await insertTurn(pg);
    await assert.rejects(insertTurn(pg, { id: "duplicate" }), /unique|duplicate/i);
    await insertTurn(pg, { id: "turn-b", conversationId: "conversation-b", instanceId: "instance-b", sourceMessageId: "source-b" });
    assert.deepEqual((await pg.query('SELECT "conversationId", "sourceMessageId" FROM "AliceAutonomousTurn" ORDER BY "id"')).rows, [
      { conversationId: "conversation-a", sourceMessageId: "source-a" },
      { conversationId: "conversation-b", sourceMessageId: "source-b" },
    ]);
  } finally { await pg.close(); }
});

test("fila de respostas não fica disponível publicamente pelo Supabase", async () => {
  const { pg } = await database();
  try {
    const relation = await pg.query(`
      SELECT c.relrowsecurity,
        (SELECT count(*)::int FROM pg_policy p WHERE p.polrelid=c.oid) AS public_policies
      FROM pg_class c WHERE c.relname='AliceAutonomousTurn'
    `);
    assert.deepEqual(relation.rows, [{ relrowsecurity: true, public_policies: 0 }]);
  } finally { await pg.close(); }
});

test("primeira resposta usa a última entrada como referência e o lote antigo também espera trinta segundos", () => {
  const first = new Date("2026-11-09T03:00:00.000Z");
  assert.equal(aliceAutonomyAvailableAt(first, new Date("2026-11-09T03:00:05.000Z")).toISOString(), "2026-11-09T03:00:30.000Z");
  assert.equal(aliceAutonomyAvailableAt(new Date("2026-11-09T03:00:12.000Z"), new Date("2026-11-09T03:00:15.000Z")).toISOString(), "2026-11-09T03:00:42.000Z");
  assert.equal(aliceAutonomyAvailableAt(first, new Date("2026-11-09T03:01:00.000Z")).toISOString(), "2026-11-09T03:01:00.000Z");
  assert.equal(aliceAutonomyAvailableAt(first, new Date("2026-11-09T03:01:00.000Z"), true).toISOString(), "2026-11-09T03:01:30.000Z");
});

test("ativação exige a caixa de SBC e marco válido sem aceitar alterações nas regras aprovadas", () => {
  const enabled = { enabled: true, instanceId: ALICE_AUTONOMY_INSTANCE_ID, activatedAt: "2026-11-09T03:00:00.000Z" };
  assert.equal(parseAliceAutonomyConfig(JSON.stringify(enabled)).enabled, true);
  assert.equal(parseAliceAutonomyConfig(JSON.stringify({ ...enabled, instanceId: "other-unit" })).enabled, false);
  assert.equal(parseAliceAutonomyConfig(JSON.stringify({ ...enabled, activatedAt: "invalid" })).enabled, false);
  assert.equal(parseAliceAutonomyConfig("invalid json").enabled, false);
  const attemptedOverride = parseAliceAutonomyConfig(JSON.stringify({ ...enabled, initialDelayMs: 0, complementDelayMs: 0, monthlyLimitMicroUsd: 100 }));
  assert.equal(attemptedOverride.initialDelayMs, 30_000);
  assert.equal(attemptedOverride.complementDelayMs, 3_000);
  assert.equal(attemptedOverride.monthlyLimitMicroUsd, null);
});

test("conversas manuais, bloqueadas, arquivadas, pausadas ou de outra caixa não são elegíveis", () => {
  const ready = { instanceId: ALICE_AUTONOMY_INSTANCE_ID, status: "open", blockedAt: null, archivedAt: null, commercialPaused: false, aiMode: "agent" };
  assert.equal(aliceAutonomyConversationEligible(ready), true);
  for (const override of [
    { instanceId: "other-unit" }, { aiMode: "manual" }, { aiMode: "suggestions" },
    { status: "closed" }, { status: "resolved" }, { status: "lost" },
    { blockedAt: new Date() }, { archivedAt: new Date() }, { commercialPaused: true },
  ]) assert.equal(aliceAutonomyConversationEligible({ ...ready, ...override }), false);
});

test("falhas transitórias mantêm Alice ativa, mas segurança clínica e envio incerto exigem controle humano", () => {
  for (const reason of ["human_review", "generation_requires_review", "word_limit", "provider_unavailable", "worker_failed_before_send"]) {
    assert.equal(aliceAutonomyRequiresHumanOwnership("needs_human", reason), false, reason);
  }
  for (const reason of ["clinical_safety", "unsupported_procedure", "booking_requires_review", "audio_requires_review"]) {
    assert.equal(aliceAutonomyRequiresHumanOwnership("needs_human", reason), true, reason);
  }
  assert.equal(aliceAutonomyRequiresHumanOwnership("uncertain", "human_review"), true);
  assert.equal(aliceAutonomyRequiresHumanOwnership("skipped", "clinical_safety"), false);
});

test("retomada individual aceita somente falhas recuperáveis, nunca segurança clínica ou envio incerto", () => {
  for (const error of ["human_review", "generation_requires_review", "word_limit", "worker_failed_before_send", "schedule_option_expired_or_invalid"]) {
    assert.equal(aliceRetryableTurnError(error), true, error);
  }
  for (const error of ["clinical_safety", "unsupported_procedure", "booking_requires_review", "provider_send_uncertain_no_retry"]) {
    assert.equal(aliceRetryableTurnError(error), false, error);
  }
  assert.equal(aliceRetryableTurnError(null), false);
});

test("custo corresponde aos tokens observados, inclusive saída e categorias de cache", () => {
  // Exemplo independente: custo calculado do teste Sonnet documentado em 09/11.
  assert.equal(aliceAutonomyCostMicroUsd({ input: 79_926, output: 903 }), 253_323);
  assert.equal(aliceAutonomyCostMicroUsd({ input: 0, output: 0, cacheRead: 10_000, cacheCreation: 1_000 }), 6_750);
});

test("migração rejeita estado e unidade que não pertencem ao piloto", async () => {
  const { pg } = await database();
  try {
    await assert.rejects(insertTurn(pg, { status: "retry_sending" }), /check/i);
    await assert.rejects(insertTurn(pg, { unit: "Osasco" }), /check/i);
  } finally { await pg.close(); }
});

test("claim só assume uma entrada vencida da caixa autorizada e bloqueia outro turno simultâneo da mesma conversa", async () => {
  const { pg, adapter } = await database();
  try {
    await insertTurn(pg, { id: "other-unit" });
    await insertTurn(pg, { id: "future", conversationId: "future", sourceMessageId: "future", instanceId: ALICE_AUTONOMY_INSTANCE_ID });
    await pg.query('UPDATE "AliceAutonomousTurn" SET "availableAt"=NOW()+interval \'1 hour\' WHERE id=\'future\'');
    await insertTurn(pg, { id: "ready", sourceMessageId: "current", instanceId: ALICE_AUTONOMY_INSTANCE_ID });
    await insertTurn(pg, { id: "same-conversation", sourceMessageId: "later", instanceId: ALICE_AUTONOMY_INSTANCE_ID });
    const claim = await claimAliceAutonomousTurn(adapter);
    assert.equal(claim.turn.id, "ready");
    assert.equal(claim.turn.status, "processing");
    assert.equal(claim.turn.attempts, 1);
    assert.equal(claim.turn.claimToken, claim.token);
    assert.ok(claim.turn.claimedAt instanceof Date);
    assert.equal(await claimAliceAutonomousTurn(adapter), null);
  } finally { await pg.close(); }
});

test("retomada recente de horário sem escolha exata não repete reserva nem ultrapassa 100 horas", async () => {
  const now = new Date("2026-11-10T18:00:00.000Z");
  const { pg, adapter } = await database({ memory: true });
  try {
    await activateFixture(pg, ALICE_AUTONOMY_INSTANCE_ID, now);
    const operator = "codex-resume-100h";
    await pg.query(`UPDATE "WhatsAppConversation" SET "aiMode"='agent',"aiModeUpdatedBy"=$1 WHERE id='conversation-a'`, [operator]);
    await pg.query(`INSERT INTO "WhatsAppMessage" (id,"conversationId","messageId","fromMe",timestamp,"createdAt",status,type,body,"respondedByName")
      VALUES ('offer','conversation-a','offer-id',TRUE,$1,$1,'delivered','text','11/11/2026 às 10h30 ou 13h30. Qual prefere?','Alice')`, [new Date(now.getTime() - 20_000)]);
    await pg.query(`UPDATE "WhatsAppMessage" SET body='Pode ser no horário que tiver?' WHERE id='source-a'`);
    await insertTurn(pg, { instanceId: ALICE_AUTONOMY_INSTANCE_ID, status: "needs_human" });
    await pg.query(`UPDATE "AliceAutonomousTurn" SET status='needs_human',error='booking_requires_review',attempts=1 WHERE id='turn-a'`);
    const params = { conversationId: "conversation-a", instanceId: ALICE_AUTONOMY_INSTANCE_ID, sourceMessageId: "source-a",
      timestamp: new Date(now.getTime() - 10_000), origin: "inbound", resumeBookingBy: operator };
    const result = await enqueueAliceAutonomousTurn(params, adapter, now);
    assert.equal(result.queued, true);
    assert.equal((await pg.query(`SELECT status,error FROM "AliceAutonomousTurn" WHERE id='turn-a'`)).rows[0].status, "queued");

    await pg.query(`UPDATE "AliceAutonomousTurn" SET status='needs_human',error='booking_requires_review',"completedAt"=NOW() WHERE id='turn-a'`);
    await pg.query(`UPDATE "WhatsAppMessage" SET timestamp=$1,"createdAt"=$1 WHERE id='source-a'`, [new Date(now.getTime() - 101 * 60 * 60_000)]);
    const expired = await enqueueAliceAutonomousTurn({ ...params, timestamp: new Date(now.getTime() - 101 * 60 * 60_000) }, adapter, now);
    assert.equal(expired.queued, false);
    assert.equal((await pg.query(`SELECT status,error FROM "AliceAutonomousTurn" WHERE id='turn-a'`)).rows[0].error, "booking_requires_review");
  } finally { await pg.close(); }
});

test("replay conserva um único turno e nova entrada substitui a resposta pendente sem antecipar os trinta segundos", async () => {
  const { pg, adapter } = await database();
  const now = new Date();
  const input = { conversationId: "conversation-a", instanceId: ALICE_AUTONOMY_INSTANCE_ID, sourceMessageId: "source-a", timestamp: now, origin: "inbound" };
  try {
    await activateFixture(pg, ALICE_AUTONOMY_INSTANCE_ID, now);
    const first = await enqueueAliceAutonomousTurn(input, adapter, now);
    assert.equal(first.queued, true);
    const repeated = await enqueueAliceAutonomousTurn(input, adapter, now);
    assert.equal(repeated.turnId, first.turnId);
    assert.deepEqual((await pg.query('SELECT count(*)::int AS count FROM "AliceAutonomousTurn"')).rows, [{ count: 1 }]);
    await pg.query('INSERT INTO "WhatsAppMessage" (id,"conversationId","messageId",timestamp,"createdAt") VALUES (\'new-inbound\',\'conversation-a\',\'new-provider-id\',$1,$1)', [now]);
    const next = await enqueueAliceAutonomousTurn({ ...input, sourceMessageId: "new-inbound" }, adapter, now);
    assert.equal(next.queued, true);
    assert.notEqual(next.turnId, first.turnId);
    const rows = (await pg.query('SELECT "sourceMessageId",status,"availableAt",error FROM "AliceAutonomousTurn" ORDER BY "sourceMessageId"')).rows;
    assert.equal(rows[0].status, "queued");
    assert.equal(rows[0].availableAt.getTime(), now.getTime() + 30_000);
    assert.equal(rows[1].status, "skipped");
    assert.equal(rows[1].error, "new_customer_message");
  } finally { await pg.close(); }
});

test("retomada humana cancela o pendente e uma nova entrada não reativa a Alice por conta própria", async () => {
  const { pg, adapter } = await database();
  const now = new Date();
  const input = { conversationId: "conversation-a", instanceId: ALICE_AUTONOMY_INSTANCE_ID, sourceMessageId: "source-a", timestamp: now, origin: "inbound" };
  try {
    await activateFixture(pg, ALICE_AUTONOMY_INSTANCE_ID, now);
    await enqueueAliceAutonomousTurn(input, adapter, now);
    assert.equal(await pauseAliceForHuman(input.conversationId, adapter), 1);
    assert.deepEqual((await pg.query('SELECT status,error FROM "AliceAutonomousTurn"')).rows, [{ status: "skipped", error: "human_takeover" }]);
    const retry = await enqueueAliceAutonomousTurn(input, adapter, now);
    assert.equal(retry.queued, false);
    assert.equal(retry.reason, "conversation_paused");
    assert.deepEqual((await pg.query('SELECT "aiMode" FROM "WhatsAppConversation" WHERE id=\'conversation-a\'')).rows, [{ aiMode: "manual" }]);
  } finally { await pg.close(); }
});

test("mensagem nova reativa uma conversa parada por falha transitória, mas respeita takeover e escalonamento clínico", async () => {
  const { pg, adapter } = await database({ memory: true });
  const now = new Date();
  try {
    await activateFixture(pg, ALICE_AUTONOMY_INSTANCE_ID, now);
    await pg.exec(`UPDATE "WhatsAppConversation" SET "aiMode"='manual',"aiModeUpdatedAt"=NOW(),"aiModeUpdatedBy"='alice-handoff' WHERE id='conversation-a'`);
    await insertTurn(pg, { instanceId: ALICE_AUTONOMY_INSTANCE_ID, origin: "inbound", status: "needs_human" });
    await pg.exec(`UPDATE "AliceAutonomousTurn" SET error='human_review'`);
    await pg.query(`INSERT INTO "WhatsAppMessage" (id,"conversationId","messageId",timestamp,"createdAt") VALUES ('new-source','conversation-a','new-provider-id',$1,$1)`, [now]);
    const input = { conversationId: "conversation-a", instanceId: ALICE_AUTONOMY_INSTANCE_ID,
      sourceMessageId: "new-source", timestamp: now, origin: "inbound" };
    assert.equal((await enqueueAliceAutonomousTurn(input, adapter, now)).queued, true);
    assert.deepEqual((await pg.query(`SELECT "aiMode","aiModeUpdatedBy" FROM "WhatsAppConversation" WHERE id='conversation-a'`)).rows,
      [{ aiMode: "agent", aiModeUpdatedBy: "alice-autonomy" }]);
  } finally { await pg.close(); }

  const guarded = await database({ memory: true });
  try {
    await activateFixture(guarded.pg, ALICE_AUTONOMY_INSTANCE_ID, now);
    await guarded.pg.exec(`UPDATE "WhatsAppConversation" SET "aiMode"='manual',"aiModeUpdatedAt"=NOW(),"aiModeUpdatedBy"='alice-handoff' WHERE id='conversation-a'`);
    await insertTurn(guarded.pg, { instanceId: ALICE_AUTONOMY_INSTANCE_ID, origin: "inbound", status: "needs_human" });
    await guarded.pg.exec(`UPDATE "AliceAutonomousTurn" SET error='human_review';
      INSERT INTO "LeadMemory" (id,"conversationId",unidade,"escalarHumano","updatedAt") VALUES ('memory','conversation-a','SBC',TRUE,NOW());`);
    await guarded.pg.query(`INSERT INTO "WhatsAppMessage" (id,"conversationId","messageId",timestamp,"createdAt") VALUES ('new-source','conversation-a','new-provider-id',$1,$1)`, [now]);
    const input = { conversationId: "conversation-a", instanceId: ALICE_AUTONOMY_INSTANCE_ID,
      sourceMessageId: "new-source", timestamp: now, origin: "inbound" };
    const result = await enqueueAliceAutonomousTurn(input, guarded.adapter, now);
    assert.equal(result.queued, false);
    assert.equal(result.reason, "conversation_paused");
  } finally { await guarded.pg.close(); }
});

test("nova pergunta textual volta à Alice após revisão resolvida por avaliação registrada", async () => {
  const now = new Date("2026-11-10T19:00:00.000Z");
  const { pg, adapter } = await database({ memory: true });
  try {
    await activateFixture(pg, ALICE_AUTONOMY_INSTANCE_ID, now);
    await pg.query(`UPDATE "WhatsAppConversation" SET "aiMode"='manual',"aiModeUpdatedBy"='alice-handoff' WHERE id='conversation-a'`);
    await pg.query(`UPDATE "WhatsAppMessage" SET body='Escolha o horário' WHERE id='source-a'`);
    await insertTurn(pg, { instanceId: ALICE_AUTONOMY_INSTANCE_ID, status: "needs_human" });
    await pg.query(`UPDATE "AliceAutonomousTurn" SET status='needs_human',error='booking_requires_review',attempts=1 WHERE id='turn-a'`);
    await pg.query(`INSERT INTO "WhatsAppMessage" (id,"conversationId","messageId","fromMe",timestamp,"createdAt",status,type,body)
      VALUES ('new-source','conversation-a','new-provider-id',FALSE,$1,$1,'received','text','A avaliação é gratuita?')`, [new Date(now.getTime() - 5_000)]);
    await pg.query(`INSERT INTO "Agendamento" (id,unit,"clientPhone",procedimento,status,"startTime","endTime")
      VALUES ('scheduled-evaluation','SBC','5511900001234','Avaliação Glúteos Perfeitos','confirmado',$1,$2)`,
      [new Date(now.getTime() + 7 * 86_400_000), new Date(now.getTime() + 7 * 86_400_000 + 30 * 60_000)]);

    const result = await enqueueAliceAutonomousTurn({ conversationId: "conversation-a", instanceId: ALICE_AUTONOMY_INSTANCE_ID,
      sourceMessageId: "new-source", timestamp: new Date(now.getTime() - 5_000), origin: "inbound" }, adapter, now);
    assert.equal(result.queued, true);
    assert.equal((await pg.query(`SELECT "aiMode","aiModeUpdatedBy" FROM "WhatsAppConversation" WHERE id='conversation-a'`)).rows[0].aiMode, "agent");
    assert.equal((await pg.query(`SELECT status FROM "AliceAutonomousTurn" WHERE "sourceMessageId"='new-source'`)).rows[0].status, "queued");
  } finally { await pg.close(); }
});

test("retomada explícita reaproveita só a escolha sem envio nem avaliação, nunca por replay do webhook", async () => {
  const { pg, adapter } = await database();
  const now = new Date();
  const input = { conversationId: "conversation-a", instanceId: ALICE_AUTONOMY_INSTANCE_ID, sourceMessageId: "source-a", timestamp: now, origin: "backlog", resumeBookingBy: "operator" };
  try {
    await activateFixture(pg, input.instanceId, now);
    await pg.exec(`UPDATE "WhatsAppConversation" SET "aiMode"='agent',"aiModeUpdatedBy"='operator' WHERE id='conversation-a'`);
    await insertTurn(pg, { instanceId: input.instanceId, status: "needs_human" });
    await pg.exec(`UPDATE "AliceAutonomousTurn" SET error='booking_requires_review'`);
    for (const changes of [{ origin: 'inbound' }, { resumeBookingBy: undefined }, { resumeBookingBy: 'someone-else' }]) {
      assert.equal((await enqueueAliceAutonomousTurn({ ...input, ...changes }, adapter, now)).queued, false);
    }
    await pg.exec(`INSERT INTO "AliceAutoSchedule"(id,"conversationId","replyMessageId",state) VALUES ('proof','conversation-a','source-a','uncertain')`);
    assert.equal((await enqueueAliceAutonomousTurn(input, adapter, now)).queued, false);
    await pg.exec(`DELETE FROM "AliceAutoSchedule" WHERE id='proof'`);
    assert.equal((await enqueueAliceAutonomousTurn(input, adapter, now)).queued, true);
    assert.deepEqual((await pg.query(`SELECT id,status FROM "AliceAutonomousTurn"`)).rows, [{ id: 'turn-a', status: 'queued' }]);
  } finally { await pg.close(); }
});

test("falha recuperável recente só recebe uma nova tentativa textual explícita sem envio, agendamento ou alerta clínico", async () => {
  const { pg, adapter } = await database({ memory: true });
  const now = new Date();
  const input = { conversationId: "conversation-a", instanceId: ALICE_AUTONOMY_INSTANCE_ID, sourceMessageId: "source-a",
    timestamp: now, origin: "inbound", resumeSoftFailureBy: "operator" };
  try {
    await activateFixture(pg, input.instanceId, now);
    await pg.exec(`UPDATE "WhatsAppConversation" SET "aiMode"='agent',"aiModeUpdatedBy"='operator' WHERE id='conversation-a'`);
    await insertTurn(pg, { instanceId: input.instanceId, origin: "inbound", status: "needs_human" });
    await pg.exec(`UPDATE "AliceAutonomousTurn" SET error='word_limit',"generationStartedAt"=NOW(),attempts=1`);

    assert.equal((await enqueueAliceAutonomousTurn({ ...input, resumeSoftFailureBy: undefined }, adapter, now)).queued, false);
    assert.equal((await enqueueAliceAutonomousTurn({ ...input, origin: "backlog" }, adapter, now)).queued, true);
    await pg.exec(`UPDATE "AliceAutonomousTurn" SET status='needs_human',error='word_limit',attempts=1`);
    assert.equal((await enqueueAliceAutonomousTurn(input, adapter, now)).queued, true);
    assert.deepEqual((await pg.query(`SELECT status,error FROM "AliceAutonomousTurn"`)).rows, [{ status: "queued", error: null }]);

    await pg.exec(`UPDATE "AliceAutonomousTurn" SET status='needs_human',error='word_limit',attempts=2`);
    assert.equal((await enqueueAliceAutonomousTurn(input, adapter, now)).queued, false);
    await pg.exec(`UPDATE "AliceAutonomousTurn" SET status='needs_human',error='word_limit',attempts=3`);
    assert.equal((await enqueueAliceAutonomousTurn(input, adapter, now)).queued, true);
    await pg.exec(`UPDATE "AliceAutonomousTurn" SET status='needs_human',error='word_limit',attempts=4`);
    assert.equal((await enqueueAliceAutonomousTurn(input, adapter, now)).queued, false);
    await pg.exec(`UPDATE "AliceAutonomousTurn" SET status='needs_human',error='human_review',attempts=2`);
    assert.equal((await enqueueAliceAutonomousTurn(input, adapter, now)).queued, true);
    await pg.exec(`UPDATE "AliceAutonomousTurn" SET status='needs_human',error='human_review',attempts=3`);
    assert.equal((await enqueueAliceAutonomousTurn(input, adapter, now)).queued, false);
    await pg.exec(`UPDATE "AliceAutonomousTurn" SET status='needs_human',attempts=1`);
    await pg.exec(`INSERT INTO "LeadMemory" (id,"conversationId",unidade,"escalarHumano","updatedAt") VALUES ('memory','conversation-a','SBC',TRUE,NOW())`);
    assert.equal((await enqueueAliceAutonomousTurn(input, adapter, now)).queued, false);
    await pg.exec(`UPDATE "LeadMemory" SET "escalarHumano"=FALSE WHERE id='memory'`);
    await pg.exec(`UPDATE "WhatsAppMessage" SET type='secretEncryptedMessage',body='' WHERE id='source-a'`);
    assert.equal((await enqueueAliceAutonomousTurn(input, adapter, now)).queued, false);
  } finally { await pg.close(); }
});

test("retomada explícita recupera apenas entrada recente cancelada por envelope criptografado vazio", async () => {
  const { pg, adapter } = await database({ memory: true });
  const now = new Date();
  const input = { conversationId: "conversation-a", instanceId: ALICE_AUTONOMY_INSTANCE_ID, sourceMessageId: "source-a",
    timestamp: now, origin: "inbound" };
  try {
    await activateFixture(pg, input.instanceId, now);
    await insertTurn(pg, { instanceId: input.instanceId, origin: "inbound", status: "skipped" });
    await pg.exec(`UPDATE "AliceAutonomousTurn" SET error='new_customer_message',attempts=0`);
    await pg.exec(`UPDATE "WhatsAppConversation" SET "aiMode"='agent',"aiModeUpdatedBy"='operator' WHERE id='conversation-a'`);
    await pg.exec(`INSERT INTO "WhatsAppMessage" (id,"conversationId","messageId","fromMe",timestamp,"createdAt",status,body,type)
      SELECT 'empty-envelope','conversation-a','empty-envelope',FALSE,timestamp+interval '1 second',"createdAt"+interval '1 second',
        'received','','secretEncryptedMessage' FROM "WhatsAppMessage" WHERE id='source-a'`);

    assert.equal((await enqueueAliceAutonomousTurn(input, adapter, now)).queued, false,
      "o evento vazio não pode provocar retomada sem ação explícita");
    const resumed = await enqueueAliceAutonomousTurn({ ...input, resumeEmptyEnvelopeBy: "operator" }, adapter, now);
    assert.equal(resumed.queued, true, JSON.stringify(resumed));
    assert.deepEqual((await pg.query(`SELECT status,error FROM "AliceAutonomousTurn"`)).rows, [{ status: "queued", error: null }]);

    await pg.exec(`UPDATE "AliceAutonomousTurn" SET status='skipped',error='new_customer_message',attempts=0,"messagesJson"=NULL`);
    await pg.exec(`INSERT INTO "LeadMemory" (id,"conversationId",unidade,"escalarHumano","updatedAt")
      VALUES ('memory-a','conversation-a','SBC',TRUE,NOW())`);
    assert.equal((await enqueueAliceAutonomousTurn({ ...input, resumeEmptyEnvelopeBy: "operator" }, adapter, now)).queued, false,
      "escalonamento clínico ainda ativo impede retomada");
    await pg.exec(`UPDATE "LeadMemory" SET "escalarHumano"=FALSE WHERE id='memory-a'`);
    await pg.exec(`DELETE FROM "WhatsAppMessage" WHERE id='empty-envelope'`);
    assert.equal((await enqueueAliceAutonomousTurn({ ...input, resumeEmptyEnvelopeBy: "operator" }, adapter, now)).queued, false,
      "a retomada só vale quando existe o envelope vazio posterior que causou o cancelamento");
  } finally { await pg.close(); }
});

test("erro de horário expirado só pode ser retomado para uma entrada textual recente", async () => {
  const { pg, adapter } = await database({ memory: true });
  const now = new Date();
  const input = { conversationId: "conversation-a", instanceId: ALICE_AUTONOMY_INSTANCE_ID, sourceMessageId: "source-a",
    timestamp: now, origin: "inbound", resumeScheduleBy: "operator" };
  try {
    await activateFixture(pg, input.instanceId, now);
    await pg.exec(`UPDATE "WhatsAppConversation" SET "aiMode"='agent',"aiModeUpdatedBy"='operator' WHERE id='conversation-a'`);
    await insertTurn(pg, { instanceId: input.instanceId, origin: "inbound", status: "needs_human" });
    await pg.exec(`UPDATE "AliceAutonomousTurn" SET error='schedule_option_expired_or_invalid',"generationStartedAt"=NOW(),attempts=1`);
    assert.equal((await enqueueAliceAutonomousTurn(input, adapter, now)).queued, true);

    await pg.exec(`UPDATE "AliceAutonomousTurn" SET status='needs_human',error='schedule_option_expired_or_invalid',"generationStartedAt"=NOW(),attempts=2`);
    assert.equal((await enqueueAliceAutonomousTurn(input, adapter, now)).queued, false);
    await pg.exec(`UPDATE "AliceAutonomousTurn" SET attempts=1`);
    await pg.exec(`UPDATE "WhatsAppMessage" SET type='audio',body='' WHERE id='source-a'`);
    assert.equal((await enqueueAliceAutonomousTurn(input, adapter, now)).queued, false);
    assert.deepEqual((await pg.query(`SELECT status,error FROM "AliceAutonomousTurn"`)).rows,
      [{ status: "needs_human", error: "schedule_option_expired_or_invalid" }]);
  } finally { await pg.close(); }
});

test("retomada de receio geral exige ativação explícita e não vence escalonamento ainda ativo", async () => {
  const now = new Date();
  const safe = await database({ memory: true });
  try {
    await activateFixture(safe.pg, ALICE_AUTONOMY_INSTANCE_ID, now);
    await safe.pg.exec(`UPDATE "WhatsAppConversation" SET "aiMode"='agent',"aiModeUpdatedBy"='operator' WHERE id='conversation-a'`);
    await insertTurn(safe.pg, { instanceId: ALICE_AUTONOMY_INSTANCE_ID, status: "needs_human" });
    await safe.pg.exec(`UPDATE "AliceAutonomousTurn" SET error='clinical_safety',attempts=1`);
    const params = { conversationId: "conversation-a", instanceId: ALICE_AUTONOMY_INSTANCE_ID, sourceMessageId: "source-a",
      timestamp: new Date(now.getTime() - 10_000), origin: "inbound", resumeClinicalFearBy: "operator" };
    assert.equal((await enqueueAliceAutonomousTurn(params, safe.adapter, now)).queued, true);
    assert.deepEqual((await safe.pg.query(`SELECT status,error FROM "AliceAutonomousTurn"`)).rows,
      [{ status: "queued", error: null }]);
  } finally { await safe.pg.close(); }

  const guarded = await database({ memory: true });
  try {
    await activateFixture(guarded.pg, ALICE_AUTONOMY_INSTANCE_ID, now);
    await guarded.pg.exec(`UPDATE "WhatsAppConversation" SET "aiMode"='agent',"aiModeUpdatedBy"='operator' WHERE id='conversation-a'`);
    await insertTurn(guarded.pg, { instanceId: ALICE_AUTONOMY_INSTANCE_ID, status: "needs_human" });
    await guarded.pg.exec(`UPDATE "AliceAutonomousTurn" SET error='clinical_safety',attempts=1;
      INSERT INTO "LeadMemory" (id,"conversationId",unidade,"escalarHumano","motivoEscalonamento","updatedAt")
      VALUES ('memory','conversation-a','SBC',TRUE,'clinical_safety',NOW());`);
    assert.equal((await guarded.adapter.leadMemory.findFirst({ where: { conversationId: "conversation-a", unidade: "SBC", escalarHumano: true }, select: { id: true } }))?.id, "memory");
    const params = { conversationId: "conversation-a", instanceId: ALICE_AUTONOMY_INSTANCE_ID, sourceMessageId: "source-a",
      timestamp: new Date(now.getTime() - 10_000), origin: "inbound", resumeClinicalFearBy: "operator" };
    const blocked = await enqueueAliceAutonomousTurn(params, guarded.adapter, now);
    assert.equal(blocked.queued, false);
    assert.equal((await enqueueAliceAutonomousTurn({ ...params, resumeClinicalFearBy: undefined }, guarded.adapter, now)).queued, false);
    assert.deepEqual((await guarded.pg.query(`SELECT status,error FROM "AliceAutonomousTurn"`)).rows,
      [{ status: "needs_human", error: "clinical_safety" }]);
  } finally { await guarded.pg.close(); }
});

test("preço bloqueado por avaliação passada só é retomado por operador sem compromisso atual ou efeitos externos", async () => {
  const { pg, adapter } = await database({ memory: true });
  const now = new Date();
  const input = { conversationId: "conversation-a", instanceId: ALICE_AUTONOMY_INSTANCE_ID, sourceMessageId: "source-a",
    timestamp: now, origin: "backlog", resumeHistoricalPriceBy: "operator" };
  try {
    await activateFixture(pg, input.instanceId, now);
    await pg.exec(`UPDATE "WhatsAppConversation" SET "aiMode"='agent',"aiModeUpdatedBy"='operator' WHERE id='conversation-a'`);
    await insertTurn(pg, { instanceId: input.instanceId, status: "needs_human" });
    await pg.exec(`UPDATE "AliceAutonomousTurn" SET error='price_after_booking',"generationStartedAt"=NOW(),"costMicroUsd"=501,"usageRecorded"=true`);
    for (const changes of [{ origin: "inbound" }, { resumeHistoricalPriceBy: undefined }, { resumeHistoricalPriceBy: "someone-else" }]) {
      assert.equal((await enqueueAliceAutonomousTurn({ ...input, ...changes }, adapter, now)).queued, false);
    }
    await pg.exec(`INSERT INTO "Agendamento" (id,unit,"clientPhone",procedimento,status,"startTime","endTime") VALUES
      ('evaluation','SBC','5511900001234','Avaliação','pendente',NOW()+interval '1 week',NOW()+interval '1 week 30 minutes')`);
    assert.equal((await enqueueAliceAutonomousTurn(input, adapter, now)).queued, false);
    await pg.exec(`UPDATE "Agendamento" SET "startTime"=NOW()-interval '1 week',"endTime"=NOW()-interval '1 week'+interval '30 minutes';
      INSERT INTO "AliceAutoSchedule"(id,"conversationId","replyMessageId",state) VALUES ('proof','conversation-a','source-a','uncertain')`);
    assert.equal((await enqueueAliceAutonomousTurn(input, adapter, now)).queued, false);
    await pg.exec(`DELETE FROM "AliceAutoSchedule" WHERE id='proof';
      INSERT INTO "WhatsAppMessage"(id,"conversationId","messageId","fromMe") VALUES ('team','conversation-a','out',true)`);
    assert.equal((await enqueueAliceAutonomousTurn(input, adapter, now)).queued, false);
    await pg.exec(`DELETE FROM "WhatsAppMessage" WHERE id='team'; UPDATE "AliceAutonomousTurn" SET "nextMessageIndex"=1`);
    assert.equal((await enqueueAliceAutonomousTurn(input, adapter, now)).queued, false);
    await pg.exec(`UPDATE "AliceAutonomousTurn" SET "nextMessageIndex"=0,error='clinical_safety'`);
    assert.equal((await enqueueAliceAutonomousTurn(input, adapter, now)).queued, false);
    await pg.exec(`UPDATE "AliceAutonomousTurn" SET error='price_after_booking';
      INSERT INTO "LeadMemory" (id,"conversationId",unidade,"escalarHumano","updatedAt") VALUES ('memory','conversation-a','SBC',TRUE,NOW())`);
    assert.equal((await enqueueAliceAutonomousTurn(input, adapter, now)).queued, false);
    await pg.exec(`UPDATE "LeadMemory" SET "escalarHumano"=FALSE WHERE id='memory';
      INSERT INTO "WhatsAppMessage"(id,"conversationId","messageId") VALUES ('later-source','conversation-a','later')`);
    assert.equal((await enqueueAliceAutonomousTurn(input, adapter, now)).queued, false);
    await pg.exec(`DELETE FROM "WhatsAppMessage" WHERE id='later-source'`);
    assert.equal((await enqueueAliceAutonomousTurn(input, adapter, now)).queued, true);
    assert.deepEqual((await pg.query(`SELECT id,status,"costMicroUsd" FROM "AliceAutonomousTurn"`)).rows,
      [{ id: 'turn-a', status: 'queued', costMicroUsd: 501 }]);
  } finally { await pg.close(); }
});

test("geração após retomada conserva o custo e os tokens da primeira tentativa", async () => {
  const f = await runnerFixture(claimAliceAutonomousTurn);
  try {
    Object.assign(f.claim.turn, { generationStartedAt: new Date(), costMicroUsd: 501, inputTokens: 10, usageRecorded: true });
    await f.pg.exec(`UPDATE "AliceAutonomousTurn" SET "generationStartedAt"=NOW(),"costMicroUsd"=501,"inputTokens"=10,"usageRecorded"=true`);
    assert.equal(await processAliceAutonomousTurn(f.claim, {}, f.deps), "queued");
    const turn = await f.readTurn();
    assert.equal(turn.costMicroUsd, 5001);
    assert.equal(turn.inputTokens, 1010);
    assert.equal(turn.usageRecorded, true);
  } finally { await f.pg.close(); }
});

test("worker interrompido encerra processamento, deixa envio incerto sem retentar e pausa a conversa", async () => {
  const { pg, adapter } = await database();
  const now = new Date();
  try {
    await activateFixture(pg, ALICE_AUTONOMY_INSTANCE_ID, now);
    await pg.query('UPDATE "WhatsAppConversation" SET "aiMode"=\'agent\' WHERE id=\'conversation-a\'');
    await insertTurn(pg, { id: "stale-send", status: "sending", instanceId: ALICE_AUTONOMY_INSTANCE_ID });
    await insertTurn(pg, { id: "stale-processing", status: "processing", sourceMessageId: "second", instanceId: ALICE_AUTONOMY_INSTANCE_ID });
    await insertTurn(pg, { id: "fresh-processing", status: "processing", sourceMessageId: "third", instanceId: ALICE_AUTONOMY_INSTANCE_ID });
    await pg.query('UPDATE "AliceAutonomousTurn" SET "claimToken"=id,"claimedAt"=$1', [new Date(now.getTime() - 121_000)]);
    await pg.query('UPDATE "AliceAutonomousTurn" SET "claimedAt"=$1 WHERE id=\'fresh-processing\'', [now]);
    assert.deepEqual(await recoverAliceAutonomousTurns(adapter, now), { uncertain: 1, failed: 1 });
    assert.deepEqual((await pg.query('SELECT id,status FROM "AliceAutonomousTurn" ORDER BY id')).rows, [
      { id: "fresh-processing", status: "processing" }, { id: "stale-processing", status: "failed" }, { id: "stale-send", status: "uncertain" },
    ]);
    assert.deepEqual((await pg.query('SELECT "aiMode" FROM "WhatsAppConversation" WHERE id=\'conversation-a\'')).rows, [{ aiMode: "manual" }]);
    assert.deepEqual(await recoverAliceAutonomousTurns(adapter, now), { uncertain: 0, failed: 0 });
    assert.equal(await claimAliceAutonomousTurn(adapter), null);
  } finally { await pg.close(); }
});

test("checagem anterior ao envio aceita apenas a própria saída e interrompe com entrada ou resposta humana nova", async () => {
  const { pg, adapter } = await database();
  const now = new Date();
  try {
    await activateFixture(pg, ALICE_AUTONOMY_INSTANCE_ID, now);
    await pg.query('UPDATE "WhatsAppConversation" SET "aiMode"=\'agent\' WHERE id=\'conversation-a\'');
    await insertTurn(pg, { instanceId: ALICE_AUTONOMY_INSTANCE_ID });
    const claim = await claimAliceAutonomousTurn(adapter);
    assert.equal(await validateAliceAutonomousTurn(claim.turn, claim.token, "processing", adapter), true);
    await pg.query('INSERT INTO "WhatsAppMessage" (id,"conversationId","messageId","fromMe",timestamp,"respondedByName") VALUES (\'own\',\'conversation-a\',\'own-provider-id\',TRUE,$1,\'Alice (automação)\')', [now]);
    assert.equal(await validateAliceAutonomousTurn({ ...claim.turn, providerMessageIds: ["own-provider-id"] }, claim.token, "processing", adapter), true);
    assert.equal(await validateAliceAutonomousTurn(claim.turn, claim.token, "processing", adapter), false);
    await pg.query('DELETE FROM "WhatsAppMessage" WHERE id=\'own\'');
    await pg.query('INSERT INTO "WhatsAppMessage" (id,"conversationId","messageId",timestamp) VALUES (\'new-customer\',\'conversation-a\',\'new\',$1)', [now]);
    assert.equal(await validateAliceAutonomousTurn(claim.turn, claim.token, "processing", adapter), false);
  } finally { await pg.close(); }
});

test("recuperação de agendamento interrompido baixa somente a confirmação comprovada no CRM", async () => {
  for (const state of ["submitted", "uncertain"]) {
    const f = await runnerFixture(claimAliceAutonomousTurn);
    try {
      await f.pg.query(`INSERT INTO "AliceAutoSchedule"(id,"conversationId","replyMessageId","appointmentId",state)
        VALUES('ledger','conversation-a','source-a','appointment',$1)`, [state]);
      await recoverAliceAutonomousTurns(f.adapter, new Date(f.state.clock.getTime() + 125_000));
      assert.equal((await f.readTurn()).status, state === "submitted" ? "sent" : "uncertain");
      assert.equal((await f.readChat()).unreadCount, state === "submitted" ? 0 : 1);
    } finally { await f.pg.close(); }
  }
});

test("duas mensagens usam uma única geração, mantêm custo e o complemento espera três segundos", async () => {
  const f = await runnerFixture(claimAliceAutonomousTurn);
  try {
    await f.pg.exec(`UPDATE "WhatsAppConversation" SET "unreadCount"=3,
      "assignedTo"='team-member', "assignedToName"='Equipe' WHERE id='conversation-a';
      UPDATE "WhatsAppConversation" SET "unreadCount"=1 WHERE id='conversation-b'`);
    assert.equal(await processAliceAutonomousTurn(f.claim, {}, f.deps), "queued");
    assert.equal((await f.readChat()).unreadCount, 3, "uma saída parcial não deve marcar o atendimento como lido");
    const first = await f.readTurn();
    assert.equal(first.nextMessageIndex, 1);
    assert.equal(first.availableAt.getTime(), f.state.clock.getTime() + 3_000);
    assert.equal(first.costMicroUsd, 4_500);
    assert.equal(await claimAliceAutonomousTurn(f.adapter), null);
    f.state.clock = new Date(f.state.clock.getTime() + 3_000);
    await f.pg.query('UPDATE "AliceAutonomousTurn" SET "availableAt"=NOW()-interval \'1 second\' WHERE id=$1', [first.id]);
    const secondClaim = await claimAliceAutonomousTurn(f.adapter);
    assert.equal(await processAliceAutonomousTurn(secondClaim, {}, f.deps), "sent");
    const complete = await f.readTurn();
    assert.equal(f.state.generations, 1);
    assert.deepEqual(f.state.sends, ["Olá, sou a Alice, assistente virtual da Virtuosa.", "Você já realizou esse procedimento antes?"]);
    assert.equal(complete.costMicroUsd, 4_500);
    assert.equal(complete.messagesJson, null);
    assert.equal(complete.nextMessageIndex, 2);
    const chat = await f.readChat();
    assert.equal(chat.unreadCount, 0, "resposta completa à última entrada deve baixar as não lidas do CRM");
    assert.equal(chat.status, "open");
    assert.equal(chat.assignedTo, "team-member");
    assert.equal(chat.assignedToName, "Equipe");
    assert.equal(chat.aiMode, "agent");
    assert.equal((await f.readChat("conversation-b")).unreadCount, 1);
  } finally { await f.pg.close(); }
});

test("horário sem escolha exata gera uma pergunta de continuidade sem handoff ou reserva", async () => {
  const f = await runnerFixture(claimAliceAutonomousTurn);
  try {
    const loadContext = f.deps.loadContext;
    const generate = f.deps.generate;
    f.deps.loadContext = async (...args) => ({ ...await loadContext(...args), messages: [
      { id: "offer", fromMe: true, status: "delivered", respondedByName: 'Alice', body: "11/11/2026 às 10h30 ou 13h30. Qual prefere?" },
      { id: "source-a", fromMe: false, status: "received", body: "Pode ser no horário que tiver?" },
    ] });
    let scheduleAttempts = 0;
    f.deps.schedule = async () => { scheduleAttempts++; return { status: "choice_required", reason: "Escolha um horário exato." }; };
    f.deps.generate = async (...args) => ({ ...await generate(...args), messages: ["Qual horário exato fica melhor para você?"] });
    assert.equal(await processAliceAutonomousTurn(f.claim, {}, f.deps), "sent", (await f.readTurn()).error);
    assert.equal(scheduleAttempts, 1);
    assert.equal(f.state.generations, 1);
    assert.deepEqual(f.state.sends, ["Qual horário exato fica melhor para você?"]);
    assert.deepEqual(f.state.handoffs, []);
    assert.equal((await f.readTurn()).appointmentId, null);
    assert.equal((await f.readChat()).aiMode, "agent");
  } finally { await f.pg.close(); }
});

for (const confirmation of ["submitted", "uncertain"]) test(`worker reconhece escolha antes de pergunta complementar; confirmação ${confirmation} controla a baixa`, async () => {
  const f = await runnerFixture(claimAliceAutonomousTurn);
  try {
    const loadContext = f.deps.loadContext;
    f.deps.loadContext = async (...args) => ({ ...await loadContext(...args), messages: [
      { id: 'offer', fromMe: true, status: 'delivered', respondedByName: 'Alice', body: 'Opções: 10/11 às 14h ou 11/11 às 14h. Qual fica melhor?' },
      { id: 'choice', fromMe: false, status: 'received', body: 'quarta às 14h' },
      { id: 'source-a', fromMe: false, status: 'received', body: 'Tem algum custo a avaliação?' },
    ] });
    let bookings = 0;
    f.deps.schedule = async ({ claimToken, turn }) => {
      assert.equal(claimToken, f.claim.token);
      assert.equal(turn.sourceMessageId, 'source-a');
      bookings++;
      await f.pg.query(`INSERT INTO "AliceAutoSchedule"(id,"conversationId","replyMessageId","appointmentId",state)
        VALUES('ledger','conversation-a','source-a','appointment',$1)`, [confirmation]);
      if (confirmation === "submitted") {
        await f.pg.query(`INSERT INTO "WhatsAppMessage" (id,"conversationId","messageId","fromMe","respondedByName",status)
          VALUES ('booking-outbound','conversation-a','provider-confirmation',true,'Alice','sent')`);
      }
      return { status: 'booked', confirmation, startTime: '2026-11-11T17:00:00Z' };
    };
    const result = await processAliceAutonomousTurn(f.claim, {}, f.deps);
    const expected = confirmation === "submitted" ? "sent" : "uncertain";
    assert.equal(result, expected, (await f.readTurn()).error);
    assert.equal(bookings, 1);
    assert.equal(f.state.generations, 0);
    assert.deepEqual(f.state.sends, [], 'a confirmação pertence ao serviço de agenda, não a uma segunda saída do worker');
    const complete = await f.readTurn();
    assert.equal(complete.appointmentId, 'appointment');
    assert.equal(complete.status, expected);
    assert.equal((await f.readChat()).unreadCount, confirmation === "submitted" ? 0 : 1);
  } finally { await f.pg.close(); }
});

test("a resposta autônoma identifica Alice como autora interna, sem atribuir o envio a uma pessoa", async () => {
  const f = await runnerFixture(claimAliceAutonomousTurn);
  try {
    await f.pg.query('UPDATE "WhatsAppConversation" SET status=\'waiting_response\' WHERE id=\'conversation-a\'');
    assert.equal(await processAliceAutonomousTurn(f.claim, {}, f.deps), "queued");
    const message = (await f.pg.query('SELECT "respondedByName" FROM "WhatsAppMessage" WHERE "fromMe"=TRUE')).rows[0];
    assert.equal(message.respondedByName, "Alice");
    assert.equal((await f.pg.query('SELECT status FROM "WhatsAppConversation" WHERE id=\'conversation-a\'')).rows[0].status, "open");
  } finally { await f.pg.close(); }
});

test("falha recuperável de geração mantém o modo Alice e não emite notificação de handoff", async () => {
  const f = await runnerFixture(claimAliceAutonomousTurn);
  try {
    f.deps.generate = async () => ({ messages: [], needsHuman: true, generationFailure: "generation_requires_review",
      model: "claude-sonnet-4-6", inputTokens: 10, outputTokens: 0, cacheReadInputTokens: 0, cacheCreationInputTokens: 0,
      costMicroUsd: 30, generationMs: 100, usageRecorded: true });
    assert.equal(await processAliceAutonomousTurn(f.claim, {}, f.deps), "needs_human");
    assert.deepEqual(f.state.handoffs, []);
    assert.equal((await f.readChat()).aiMode, "agent");
    assert.equal((await f.readTurn()).error, "generation_requires_review");
  } finally { await f.pg.close(); }
});

test("timeout depois do início do envio exige revisão humana e nunca repete a tentativa", async () => {
  const f = await runnerFixture(claimAliceAutonomousTurn);
  try {
    f.state.failSend = true;
    assert.equal(await processAliceAutonomousTurn(f.claim, {}, f.deps), "uncertain");
    const turn = await f.readTurn();
    assert.equal(turn.status, "uncertain");
    assert.equal(turn.error, "provider_send_uncertain_no_retry");
    assert.equal(turn.costMicroUsd, 4_500);
    assert.equal(turn.messagesJson.length, 2, "sequência incerta fica apenas para conferência interna, nunca como retry");
    assert.equal(f.state.handoffs.length, 1);
    assert.equal(await claimAliceAutonomousTurn(f.adapter), null);
    assert.equal(await processAliceAutonomousTurn(f.claim, {}, f.deps), "skipped");
    assert.equal(f.state.sends.length, 1);
    assert.equal((await f.readTurn()).status, "uncertain");
    assert.equal((await f.readChat()).unreadCount, 1);
  } finally { await f.pg.close(); }
});

test("intervenção imediatamente anterior à chamada externa barra a saída e conserva o custo da geração", async () => {
  const f = await runnerFixture(claimAliceAutonomousTurn);
  try {
    f.state.onBeforeSend = () => pauseAliceForHuman(f.claim.turn.conversationId, f.adapter);
    assert.equal(await processAliceAutonomousTurn(f.claim, {}, f.deps), "skipped");
    assert.deepEqual(f.state.sends, []);
    assert.equal((await f.readTurn()).costMicroUsd, 4_500);
    assert.equal((await f.readTurn()).error, "conversation_changed_before_send");
    assert.equal((await f.readChat()).unreadCount, 1);
  } finally { await f.pg.close(); }
});

test("orientação clínica e procedimento sem base são triados antes de consultar o modelo", async () => {
  for (const [body, reason] of [["Estou amamentando, posso fazer?", "clinical_safety"], ["Quero preenchimento facial", "unsupported_procedure"]]) {
    const f = await runnerFixture(claimAliceAutonomousTurn);
    try {
      await f.pg.query('UPDATE "WhatsAppMessage" SET body=$1 WHERE id=\'source-a\'', [body]);
      f.deps.loadContext = loadAliceAutonomousContext;
      assert.equal(await processAliceAutonomousTurn(f.claim, {}, f.deps), "needs_human");
      assert.equal(f.state.generations, 0);
      assert.deepEqual(f.state.sends, []);
      assert.equal(f.state.handoffs[0].reason, reason);
      assert.equal((await f.readTurn()).status, "needs_human");
      assert.equal((await f.readChat()).unreadCount, 1);
    } finally { await f.pg.close(); }
  }
});

test("entrada nova durante a geração invalida a saída antiga e abre outro prazo de trinta segundos", async () => {
  const f = await runnerFixture(claimAliceAutonomousTurn);
  try {
    f.state.onGenerate = async () => {
      await f.pg.query('INSERT INTO "WhatsAppMessage" (id,"conversationId","messageId",timestamp,"createdAt") VALUES (\'new-customer\',\'conversation-a\',\'new\',$1,$1)', [f.state.clock]);
      await enqueueAliceAutonomousTurn({ conversationId: "conversation-a", instanceId: ALICE_AUTONOMY_INSTANCE_ID,
        sourceMessageId: "new-customer", timestamp: f.state.clock, origin: "inbound" }, f.adapter, f.state.clock);
    };
    assert.equal(await processAliceAutonomousTurn(f.claim, {}, f.deps), "skipped");
    assert.deepEqual(f.state.sends, []);
    assert.equal((await f.readTurn()).costMicroUsd, 4_500);
    assert.equal((await f.readTurn()).error, "new_customer_message");
    const pending = (await f.pg.query('SELECT status,"availableAt" FROM "AliceAutonomousTurn" WHERE "sourceMessageId"=\'new-customer\'')).rows[0];
    assert.equal(pending.status, "queued");
    assert.equal(pending.availableAt.getTime(), f.state.clock.getTime() + 30_000);
  } finally { await f.pg.close(); }
});

function oneReplyDuringSend(f, afterProviderAccepted) {
  return { ...f.deps,
    generate: async (...args) => ({ ...await f.deps.generate(...args), messages: ["Podemos conversar por aqui."] }),
    send: async (params) => {
      const sent = await f.deps.send(params);
      await afterProviderAccepted();
      return sent;
    },
  };
}

for (const arrivalDeltaMs of [0, 1]) test(`entrada com o mesmo timestamp recebida antes do claim não some no desempate por UUID (chegada + ${arrivalDeltaMs} ms)`, async () => {
  const f = await runnerFixture(claimAliceAutonomousTurn, { beforeClaim: async (pg) => {
    await pg.query(`INSERT INTO "WhatsAppMessage" (id,"conversationId","messageId",timestamp,"createdAt")
      SELECT 'a-new-inbound',"conversationId",'new-provider-id',timestamp,"createdAt"+$1::int*interval '1 ms'
      FROM "WhatsAppMessage" WHERE id='source-a'`, [arrivalDeltaMs]);
    await pg.exec(`UPDATE "WhatsAppConversation" SET "unreadCount"=2 WHERE id='conversation-a'`);
  } });
  try {
    const outcome = await processAliceAutonomousTurn(f.claim, {}, { ...f.deps,
      generate: async (...args) => ({ ...await f.deps.generate(...args), messages: ["Podemos conversar por aqui."] }) });
    assert.ok(["sent", "skipped"].includes(outcome), outcome);
    assert.ok((await f.readChat()).unreadCount >= 1, "uma entrada posterior ou indistinguível não estava coberta");
  } finally { await f.pg.close(); }
});

for (const deltaMs of [0, 1_000]) test(`entrada nova durante o envio permanece não lida (horário da fonte + ${deltaMs} ms)`, async () => {
  const f = await runnerFixture(claimAliceAutonomousTurn);
  try {
    const source = await f.adapter.whatsAppMessage.findFirst({ where: { id: "source-a" } });
    const deps = oneReplyDuringSend(f, async () => {
      const timestamp = new Date(source.timestamp.getTime() + deltaMs);
      // IDs internos não indicam a ordem de chegada de mensagens no mesmo segundo.
      await f.pg.query(`INSERT INTO "WhatsAppMessage" (id,"conversationId","messageId","fromMe",timestamp)
        VALUES ('a-new-inbound','conversation-a','new-provider-id',FALSE,$1)`, [timestamp]);
      await f.pg.query(`UPDATE "WhatsAppConversation" SET "unreadCount"="unreadCount"+1, "lastInboundAt"=$1,
        "updatedAt"=NOW() WHERE id='conversation-a'`, [timestamp]);
    });
    assert.equal(await processAliceAutonomousTurn(f.claim, {}, deps), "sent");
    assert.ok((await f.readChat()).unreadCount >= 1, "a confirmação da resposta antiga não viu a nova mensagem");
  } finally { await f.pg.close(); }
});

test("claim substituída durante o envio não atualiza o turno nem a conversa pela execução antiga", async () => {
  const f = await runnerFixture(claimAliceAutonomousTurn);
  try {
    await f.pg.exec(`UPDATE "WhatsAppConversation" SET status='waiting_response',"assignedTo"='member' WHERE id='conversation-a'`);
    const deps = oneReplyDuringSend(f, () =>
      f.pg.query(`UPDATE "AliceAutonomousTurn" SET "claimToken"='new-claim' WHERE id=$1`, [f.claim.turn.id]));
    assert.equal(await processAliceAutonomousTurn(f.claim, {}, deps), "skipped");
    const { status, unreadCount, lastOutboundAt, assignedTo } = await f.readChat();
    assert.deepEqual({ status, unreadCount, lastOutboundAt, assignedTo },
      { status: "waiting_response", unreadCount: 1, lastOutboundAt: null, assignedTo: "member" });
    assert.equal((await f.readTurn()).claimToken, "new-claim");
    assert.equal((await f.readTurn()).status, "sending");
  } finally { await f.pg.close(); }
});

test("uma execução de worker não drena a fila inteira nem gera resposta extra para complemento", async () => {
  const f = await runnerFixture(claimAliceAutonomousTurn);
  try {
    await f.pg.query('UPDATE "AliceAutonomousTurn" SET status=\'queued\',"claimToken"=NULL,"claimedAt"=NULL WHERE id=$1', [f.claim.turn.id]);
    await insertTurn(f.pg, { id: "another", conversationId: "conversation-b", sourceMessageId: "source-b", instanceId: ALICE_AUTONOMY_INSTANCE_ID });
    const batch = await runAliceAutonomousBatch({}, f.deps);
    assert.equal(batch.processed, 1);
    assert.equal(f.state.generations, 1);
    assert.equal(f.state.sends.length, 1);
  } finally { await f.pg.close(); }
});

test("worker responde à recusa da manhã com uma nova oferta, sem criar reserva ou tirar o chat da Alice", async () => {
  const f = await runnerFixture(claimAliceAutonomousTurn);
  const offer = "No sábado, 14/11/2026, temos 12h30 ou 13h. Qual horário você prefere?";
  const turns = [
    { id: "old-offer", fromMe: true, status: "delivered", body: "Dia 14/11/2026 temos horários de manhã. Você prefere 8h ou 9h?" },
    { id: "restriction", fromMe: false, status: "received", body: "Eu não posso no período da manhã" },
    { id: f.claim.turn.sourceMessageId, fromMe: false, status: "received", body: "Neste sábado" },
  ];
  try {
    f.state.clock = new Date("2026-11-10T00:56:30Z");
    const outcome = await processAliceAutonomousTurn(f.claim, {}, { ...f.deps,
      loadContext: async (...args) => ({ ...await f.deps.loadContext(...args), messages: turns, source: turns.at(-1) }),
      schedule: async () => assert.fail("Uma restrição de período não é uma reserva"),
      generate: async (...args) => ({ ...await f.deps.generate(...args), messages: [offer] }),
    });
    assert.equal(outcome, "sent");
    assert.deepEqual(f.state.sends, [offer]);
    assert.equal(f.state.generations, 1);
    assert.deepEqual(f.state.handoffs, []);
    assert.equal((await f.readTurn()).appointmentId, null);
  } finally { await f.pg.close(); }
});

test("claim expirada ou com conversa/fonte diferente não autoriza a chamada externa", async () => {
  const f = await runnerFixture(claimAliceAutonomousTurn);
  try {
    assert.equal(await validateAliceAutonomousTurn({ ...f.claim.turn, sourceMessageId: "wrong-source" }, f.claim.token, "processing", f.adapter), false);
    assert.equal(await validateAliceAutonomousTurn({ ...f.claim.turn, conversationId: "conversation-b" }, f.claim.token, "processing", f.adapter), false);
    await f.pg.query('UPDATE "AliceAutonomousTurn" SET "claimedAt"=NOW()-interval \'121 seconds\' WHERE id=$1', [f.claim.turn.id]);
    assert.equal(await validateAliceAutonomousTurn(f.claim.turn, f.claim.token, "processing", f.adapter), false);
  } finally { await f.pg.close(); }
});
