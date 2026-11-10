import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { Prisma } from "@prisma/client";
import { database, queueDatabase, activateFixture, insertTurn } from "./fixtures/alice-autonomy-database.mjs";
import { aliceBacklogQuery } from "../src/lib/ai-assistant/autonomy/admin-queries.ts";
import { createAliceBacklogPreview, verifyAliceBacklogPreview } from "../src/lib/ai-assistant/autonomy/preview.ts";
import { aliceAutonomyDispatchCommand, validAliceAutonomyCronAuthorization } from "../src/lib/ai-assistant/autonomy/scheduler.ts";
import { ALICE_AUTONOMY_INSTANCE_ID } from "../src/lib/ai-assistant/autonomy/policy.ts";

process.env.JWT_SECRET = "isolated-test-secret-not-for-production";
globalThis.prisma = {};
globalThis.fetch = async () => { throw new Error("Rede externa proibida neste teste isolado"); };
const { getAliceAutonomyMonitoring, setAliceAutonomyEnabled } = await import("../src/lib/ai-assistant/autonomy/admin.ts");
const { claimAliceAutonomousTurn, recoverAliceAutonomousTurns } = await import("../src/lib/ai-assistant/autonomy/queue.ts");
const actor = { userId: "admin-test", name: "Equipe de teste" };
const ready = async () => ({ ready: true, blockers: [], operational: { blockedUntil: null } });
const sql = (first, values) => Array.isArray(first) ? Prisma.sql(first, ...values) : first;

function adminDatabase(pg) {
  const base = queueDatabase(pg);
  const query = async (first, ...values) => { const statement = sql(first, values); return pg.query(statement.text, statement.values); };
  const adapter = {
    ...base,
    $queryRaw: async (...args) => (await query(...args)).rows,
    appSetting: { ...base.appSetting,
      findUnique: async ({ where }) => (await pg.query('SELECT * FROM "AppSetting" WHERE key=$1', [where.key])).rows[0] || null,
      upsert: async ({ where, create, update }) => (await pg.query(`INSERT INTO "AppSetting"(id,key,value) VALUES($1,$2,$3)
        ON CONFLICT(key) DO UPDATE SET value=$4 RETURNING *`, [randomUUID(), where.key, create.value, update.value])).rows[0],
    },
    activityLog: { create: async ({ data }) => (await pg.query('INSERT INTO "ActivityLog"(id,"userId",metadata) VALUES($1,$2,$3) RETURNING *', [randomUUID(), data.userId, data.metadata])).rows[0] },
  };
  adapter.$transaction = (operation) => pg.transaction((connection) => operation(adminDatabase(connection)));
  return adapter;
}

async function fixture() {
  const { pg } = await database();
  await pg.exec(`
    ALTER TABLE "WhatsAppConversation" ADD COLUMN "contactId" TEXT DEFAULT 'contact-a';
    UPDATE "WhatsAppConversation" SET "unreadCount"=1;
    CREATE TABLE "WhatsAppContact"(id TEXT PRIMARY KEY,name TEXT,phone TEXT);
    INSERT INTO "WhatsAppContact" VALUES('contact-a','Contato teste','5511900001234');
    CREATE TABLE "PipelineCommercialHold"("conversationId" TEXT);
    CREATE TABLE "Agendamento"(id TEXT,unit TEXT,"clientPhone" TEXT,"startTime" TIMESTAMP,procedimento TEXT,status TEXT);
    CREATE TABLE "Client"(id TEXT,unit TEXT,phone TEXT);
    CREATE TABLE "SalesPipeline"("clientId" TEXT,unit TEXT,stage TEXT);
    CREATE TABLE "ActivityLog"(id TEXT,"userId" TEXT,metadata TEXT);
  `);
  const now = new Date();
  await activateFixture(pg, ALICE_AUTONOMY_INSTANCE_ID, now);
  await pg.query('UPDATE "AppSetting" SET value=\'{"enabled":false}\' WHERE key=\'alice_autonomous_sbc_v1\'');
  await pg.query('UPDATE "WhatsAppMessage" SET timestamp=$1,"createdAt"=$1 WHERE id=\'source-a\'', [new Date(now.getTime() - 120_000)]);
  const db = adminDatabase(pg);
  const recoveryStart = new Date(now.getTime() - 100 * 60 * 60 * 1000);
  const candidates = () => db.$queryRaw(aliceBacklogQuery({ cutoff: now, from: recoveryStart }));
  const preview = async () => createAliceBacklogPreview((await candidates())[0], now);
  return { pg, db, now, recoveryStart, candidates, preview };
}

test("prévia e revalidação da retomada excluem mensagens fora das últimas 100 horas", async () => {
  const f = await fixture();
  try {
    const oldTimestamp = new Date(f.recoveryStart.getTime() - 1_000);
    await f.pg.query('INSERT INTO "WhatsAppContact" VALUES ($1,$2,$3)', ["contact-old-timestamp", "Contato antigo", "5511900005678"]);
    await f.pg.query('INSERT INTO "WhatsAppConversation" (id,"instanceId","contactId","aiMode") VALUES ($1,$2,$3,$4)',
      ["conversation-old-timestamp", ALICE_AUTONOMY_INSTANCE_ID, "contact-old-timestamp", "agent"]);
    await f.pg.query('INSERT INTO "WhatsAppMessage"(id,"conversationId","messageId","fromMe",timestamp,"createdAt") VALUES($1,$2,$3,FALSE,$4,$4)',
      ["old-timestamp", "conversation-old-timestamp", "old-timestamp", oldTimestamp]);
    await f.pg.query('INSERT INTO "WhatsAppContact" VALUES ($1,$2,$3)', ["contact-old-created", "Contato importado", "5511900008765"]);
    await f.pg.query('INSERT INTO "WhatsAppConversation" (id,"instanceId","contactId","aiMode") VALUES ($1,$2,$3,$4)',
      ["conversation-old-created", ALICE_AUTONOMY_INSTANCE_ID, "contact-old-created", "agent"]);
    await f.pg.query('INSERT INTO "WhatsAppMessage"(id,"conversationId","messageId","fromMe",timestamp,"createdAt") VALUES($1,$2,$3,FALSE,$4,$5)',
      ["old-created", "conversation-old-created", "old-created", new Date(f.now.getTime() - 60_000), oldTimestamp]);
    assert.deepEqual((await f.candidates()).map((row) => row.conversationId), ["conversation-a"]);
    const report = await getAliceAutonomyMonitoring({ days: 7 }, f.db, f.now, ready);
    assert.deepEqual(report.backlogCandidates.map((row) => row.conversationId), ["conversation-a"]);

    const staleTimestamp = new Date(f.now.getTime() - (100 * 60 * 60 * 1000) + 60_000);
    await f.pg.query('UPDATE "WhatsAppMessage" SET timestamp=$1,"createdAt"=$1 WHERE id=\'source-a\'', [staleTimestamp]);
    const token = createAliceBacklogPreview({ conversationId: "conversation-a", sourceMessageId: "source-a", lastInboundAt: staleTimestamp }, f.now);
    await assert.rejects(setAliceAutonomyEnabled({ enabled: true, backlogAnchorConversationId: "conversation-a", backlogPreviewToken: token },
      actor, f.db, new Date(f.now.getTime() + 120_000), ready), /mudou/);
    assert.deepEqual((await f.pg.query('SELECT status FROM "AliceAutonomousTurn"')).rows, []);
  } finally { await f.pg.close(); }
});

test("ativação usa âncora assinada, mantém ordem e não consulta modelos ou envia mensagens", async () => {
  const f = await fixture();
  try {
    const before = (await f.pg.query('SELECT count(*)::int AS n FROM "WhatsAppMessage"')).rows[0].n;
    const token = await f.preview();
    const result = await setAliceAutonomyEnabled({ enabled: true, backlogAnchorConversationId: "conversation-a", backlogPreviewToken: token }, actor, f.db, f.now, ready);
    assert.equal(result.backlogEnqueued, 1);
    const row = (await f.pg.query('SELECT * FROM "AliceAutonomousTurn"')).rows[0];
    assert.equal(row.origin, "backlog");
    assert.equal(row.availableAt.getTime(), f.now.getTime() + 30_000);
    assert.equal((await f.pg.query('SELECT count(*)::int AS n FROM "WhatsAppMessage"')).rows[0].n, before);
    assert.equal((await f.pg.query('SELECT count(*)::int AS n FROM "ActivityLog"')).rows[0].n, 1);
    await assert.rejects(setAliceAutonomyEnabled({ enabled: true, backlogAnchorConversationId: "conversation-a", backlogPreviewToken: token }, actor, f.db, f.now, ready), /mudou/);
  } finally { await f.pg.close(); }
});

test("âncora forjada, outra unidade, prévia expirada e nova resposta não ativam a operação", async () => {
  const f = await fixture();
  try {
    const token = await f.preview();
    assert.throws(() => verifyAliceBacklogPreview(`${token}invalid`, "conversation-a", f.now), /prévia/);
    assert.throws(() => verifyAliceBacklogPreview(token, "conversation-b", f.now), /prévia/);
    assert.throws(() => verifyAliceBacklogPreview(token, "conversation-a", new Date(f.now.getTime() + 601_000)), /prévia/);
    await assert.rejects(setAliceAutonomyEnabled({ enabled: true, unit: "Osasco" }, actor, f.db, f.now, ready), /somente em SBC/);
    await f.pg.query('INSERT INTO "WhatsAppMessage"(id,"conversationId","messageId","fromMe",timestamp,"createdAt") VALUES(\'new\',\'conversation-a\',\'new\',FALSE,$1,$1)', [f.now]);
    await assert.rejects(setAliceAutonomyEnabled({ enabled: true, backlogAnchorConversationId: "conversation-a", backlogPreviewToken: token }, actor, f.db, f.now, ready), /mudou/);
    assert.deepEqual((await f.pg.query('SELECT value FROM "AppSetting" WHERE key=\'alice_autonomous_sbc_v1\'')).rows, [{ value: '{"enabled":false}' }]);
  } finally { await f.pg.close(); }
});

test("retomada inclui já agendados e exclui pausa comercial e respostas humanas posteriores", async () => {
  const f = await fixture();
  try {
    assert.equal((await f.candidates()).length, 1);
    await f.pg.query('INSERT INTO "Agendamento" VALUES(\'booking\',\'SBC\',\'(11)90000-1234\',$1,\'Avaliação\',\'confirmado\')', [new Date(f.now.getTime() + 86_400_000)]);
    assert.equal((await f.candidates()).length, 1);
    await f.pg.exec('DELETE FROM "Agendamento"; INSERT INTO "PipelineCommercialHold" VALUES(\'conversation-a\')');
    assert.equal((await f.candidates()).length, 0);
    await f.pg.exec('DELETE FROM "PipelineCommercialHold"');
    await f.pg.query('INSERT INTO "WhatsAppMessage"(id,"conversationId","messageId","fromMe",timestamp,"respondedByName") VALUES(\'human\',\'conversation-a\',\'human\',TRUE,$1,\'Equipe\')', [f.now]);
    assert.equal((await f.candidates()).length, 0);
  } finally { await f.pg.close(); }
});

test("pausa cancela fila sem zerar custo ou usuários manuais; retomada sem âncora não repete o lote", async () => {
  const f = await fixture();
  try {
    await setAliceAutonomyEnabled({ enabled: true, backlogAnchorConversationId: "conversation-a", backlogPreviewToken: await f.preview() }, actor, f.db, f.now, ready);
    await f.pg.exec('UPDATE "AliceAutonomousTurn" SET "costMicroUsd"=4500; UPDATE "WhatsAppConversation" SET "aiMode"=\'suggestions\' WHERE id=\'conversation-b\'');
    await setAliceAutonomyEnabled({ enabled: false }, actor, f.db, f.now, ready);
    assert.deepEqual((await f.pg.query('SELECT status,"costMicroUsd",error FROM "AliceAutonomousTurn"')).rows, [{ status: "skipped", costMicroUsd: 4500, error: "global_pause" }]);
    assert.deepEqual((await f.pg.query('SELECT "aiMode" FROM "WhatsAppConversation" WHERE id=\'conversation-b\'')).rows, [{ aiMode: "suggestions" }]);
    await setAliceAutonomyEnabled({ enabled: true }, actor, f.db, f.now, ready);
    assert.equal((await f.pg.query('SELECT status FROM "AliceAutonomousTurn"')).rows[0].status, "skipped");
    const report = await getAliceAutonomyMonitoring({ days: 7 }, f.db, f.now, ready);
    assert.equal(report.summary.costMicroUsd, 4500);
  } finally { await f.pg.close(); }
});

test("custos sem usage ficam indeterminados, e latência do backlog não mistura a espera anterior", async () => {
  const f = await fixture();
  try {
    await insertTurn(f.pg, { instanceId: ALICE_AUTONOMY_INSTANCE_ID });
    await f.pg.query('UPDATE "AliceAutonomousTurn" SET "generationStartedAt"=$1,"createdAt"=$1,origin=\'backlog\',"firstSentAt"=$2', [new Date(f.now.getTime() - 30_000), f.now]);
    const report = await getAliceAutonomyMonitoring({ days: 7 }, f.db, f.now, ready);
    assert.equal(report.items[0].costMicroUsd, null);
    assert.equal(report.summary.unknownCostTurns, 1);
    assert.equal(report.summary.averageResponseMs, 0);
    assert.equal(report.summary.averageBacklogResponseMs, 30_000);
    assert.equal(report.items[0].phoneLast4, "1234");
    assert.equal(JSON.stringify(report.items).includes("5511900001234"), false);
  } finally { await f.pg.close(); }
});

test("cron usa autenticação constante e só chama HTTP com trabalho vencido e flag ativa", () => {
  const secret = "isolated-test-cron-secret-32-characters";
  assert.equal(validAliceAutonomyCronAuthorization(`Bearer ${secret}`, secret), true);
  assert.equal(validAliceAutonomyCronAuthorization("Bearer wrong", secret), false);
  assert.equal(validAliceAutonomyCronAuthorization("Bearer tiny", "tiny"), false);
  const command = aliceAutonomyDispatchCommand(secret);
  for (const expected of ["net.http_post", "enabled", "availableAt", "claimedAt", "blockedUntil", "NOT EXISTS", "2 minutes"]) assert.ok(command.includes(expected));
  assert.equal(command.includes("/api/crm/ai-assistant/autonomy/worker"), true);
});

test("retomada dá prioridade às entradas novas e a recuperação de booking não apaga a agenda", async () => {
  const f = await fixture();
  try {
    await insertTurn(f.pg, { id: "old", sourceMessageId: "old-source", instanceId: ALICE_AUTONOMY_INSTANCE_ID });
    await insertTurn(f.pg, { id: "new", sourceMessageId: "new-source", instanceId: ALICE_AUTONOMY_INSTANCE_ID });
    await f.pg.exec('UPDATE "AliceAutonomousTurn" SET origin=\'backlog\' WHERE id=\'old\'');
    assert.equal((await claimAliceAutonomousTurn(f.db)).turn.id, "new");
    await f.pg.query('UPDATE "AliceAutonomousTurn" SET status=\'processing\',"claimedAt"=$1 WHERE id=\'old\'', [new Date(f.now.getTime() - 121_000)]);
    await f.pg.query('INSERT INTO "AliceAutoSchedule"(id,"conversationId","replyMessageId","appointmentId",state,"updatedAt") VALUES(\'ledger\',\'conversation-a\',\'old-source\',\'booking-id\',\'submitted\',$1)', [f.now]);
    await recoverAliceAutonomousTurns(f.db, f.now);
    assert.deepEqual((await f.pg.query('SELECT status,"appointmentId" FROM "AliceAutonomousTurn" WHERE id=\'old\'')).rows, [{ status: "sent", appointmentId: "booking-id" }]);
  } finally { await f.pg.close(); }
});

test("coorte acima de duzentos aborta integralmente antes de ativar ou enfileirar", async () => {
  const f = await fixture();
  try {
    await f.pg.query(`INSERT INTO "WhatsAppConversation"(id,"instanceId","unreadCount") SELECT 'extra-'||n,$1,1 FROM generate_series(1,200) n`, [ALICE_AUTONOMY_INSTANCE_ID]);
    await f.pg.query(`INSERT INTO "WhatsAppMessage"(id,"conversationId","messageId",timestamp,"createdAt") SELECT 'source-extra-'||n,'extra-'||n,'provider-extra-'||n,$1,$1 FROM generate_series(1,200) n`, [new Date(f.now.getTime() - 60_000)]);
    await assert.rejects(setAliceAutonomyEnabled({ enabled: true, backlogAnchorConversationId: "conversation-a", backlogPreviewToken: await f.preview() }, actor, f.db, f.now, ready), /200/);
    assert.equal((await f.pg.query('SELECT count(*)::int AS n FROM "AliceAutonomousTurn"')).rows[0].n, 0);
    assert.equal((await f.pg.query('SELECT value FROM "AppSetting" WHERE key=\'alice_autonomous_sbc_v1\'')).rows[0].value, '{"enabled":false}');
  } finally { await f.pg.close(); }
});

test("despacho cron executado em banco falso não chama HTTP ocioso, pausado ou com lease válida", async () => {
  const f = await fixture();
  try {
    await f.pg.exec(`CREATE SCHEMA net; CREATE FUNCTION net.http_post(url TEXT,headers JSONB,body JSONB,timeout_milliseconds INTEGER) RETURNS BIGINT LANGUAGE SQL AS $$SELECT 1::bigint$$;`);
    const command = aliceAutonomyDispatchCommand("isolated-cron-secret-no-network-32chars");
    assert.equal((await f.pg.query(command)).rows.length, 0);
    await f.pg.query('UPDATE "AppSetting" SET value=$1 WHERE key=\'alice_autonomous_sbc_v1\'', [JSON.stringify({ enabled: true, instanceId: ALICE_AUTONOMY_INSTANCE_ID })]);
    assert.equal((await f.pg.query(command)).rows.length, 0);
    await insertTurn(f.pg, { instanceId: ALICE_AUTONOMY_INSTANCE_ID });
    assert.equal((await f.pg.query(command)).rows.length, 1);
    await insertTurn(f.pg, { id: "busy", sourceMessageId: "busy-source", status: "processing", instanceId: ALICE_AUTONOMY_INSTANCE_ID });
    await f.pg.query('UPDATE "AliceAutonomousTurn" SET "claimedAt"=$1 WHERE id=\'busy\'', [new Date()]);
    assert.equal((await f.pg.query(command)).rows.length, 0);
    await f.pg.query('UPDATE "AliceAutonomousTurn" SET "claimedAt"=$1 WHERE id=\'busy\'', [new Date(Date.now() - 121_000)]);
    assert.equal((await f.pg.query(command)).rows.length, 1);
    await f.pg.query('INSERT INTO "AppSetting"(id,key,value) VALUES(\'cooldown\',\'alice_autonomous_sbc_worker_state_v1\',$1)', [JSON.stringify({ blockedUntil: new Date(Date.now() + 60_000).toISOString() })]);
    assert.equal((await f.pg.query(command)).rows.length, 0);
  } finally { await f.pg.close(); }
});

test("dois workers concorrentes em conversas diferentes só adquirem uma lease global válida", async () => {
  const f = await fixture();
  try {
    await f.pg.query('UPDATE "WhatsAppConversation" SET "instanceId"=$1 WHERE id=\'conversation-b\'', [ALICE_AUTONOMY_INSTANCE_ID]);
    await insertTurn(f.pg, { id: "first", instanceId: ALICE_AUTONOMY_INSTANCE_ID });
    await insertTurn(f.pg, { id: "second", conversationId: "conversation-b", sourceMessageId: "source-b", instanceId: ALICE_AUTONOMY_INSTANCE_ID });
    const claims = await Promise.all([claimAliceAutonomousTurn(f.db), claimAliceAutonomousTurn(f.db)]);
    assert.equal(claims.filter(Boolean).length, 1);
    assert.equal((await f.pg.query('SELECT count(*)::int AS n FROM "AliceAutonomousTurn" WHERE status=\'processing\'')).rows[0].n, 1);
  } finally { await f.pg.close(); }
});
