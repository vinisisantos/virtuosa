import assert from "node:assert/strict";
import test, { before, beforeEach, after } from "node:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { Prisma } from "@prisma/client";
globalThis.prisma = {};
const {
  retainStatusReceipts,
  claimStatusReceipt,
  recoverStaleStatusReceipts,
  completeStatusReceipt,
  deferStatusReceiptClaims,
  retryStatusReceipt,
  STATUS_RECEIPT_MAX_ATTEMPTS,
  STATUS_RECEIPT_RECOVERY_BATCH_SIZE,
} = await import("../src/lib/whatsapp/status-receipt-queue.ts");

// PostgreSQL descartável: nenhuma conexão ao Supabase ou ao WhatsApp.
const pg = new PGlite({ parsers: { 1114: (value) => new Date(`${value}Z`) } });
let operations;
const migration = await readFile(new URL(
  "../prisma/migrations/20261009010000_whatsapp_status_receipts/migration.sql", import.meta.url,
), "utf8");
const quote = (key) => Prisma.raw(`"${key}"`);
const whereSql = (where) => Prisma.join(Object.entries(where).map(([key, value]) => key === "OR"
  ? Prisma.sql`(${Prisma.join(value.map((condition) => Prisma.sql`(${whereSql(condition)})`), " OR ")})`
  : Prisma.sql`${quote(key)} = ${value}`), " AND ");
const query = async (sql) => pg.query(sql.text, sql.values);
const database = {
  $queryRaw: async (sql) => {
    operations++;
    return (await query(sql)).rows;
  },
  whatsAppStatusReceipt: {
    createManyAndReturn: async ({ data, skipDuplicates }) => {
      operations++;
      assert.equal(skipDuplicates, true);
      const rows = data.map((row) => ({ ...row, updatedAt: new Date() }));
      const keys = Object.keys(rows[0]);
      const result = await query(Prisma.sql`
        INSERT INTO "WhatsAppStatusReceipt" (${Prisma.join(keys.map(quote))})
        VALUES ${Prisma.join(rows.map((row) => Prisma.sql`(${Prisma.join(keys.map((key) => row[key]))})`))}
        ON CONFLICT DO NOTHING RETURNING *
      `);
      return result.rows;
    },
    updateMany: async ({ where, data }) => {
      operations++;
      const update = { ...data, updatedAt: new Date() };
      const result = await query(Prisma.sql`
        UPDATE "WhatsAppStatusReceipt"
        SET ${Prisma.join(Object.entries(update).map(([key, value]) => Prisma.sql`${quote(key)} = ${value}`))}
        WHERE ${whereSql(where)}
      `);
      return { count: result.affectedRows };
    },
  },
};
const input = (status = "delivered", messageId = "wa-message", remoteJid = "5511900000000@s.whatsapp.net") => ({ messageId, remoteJid, status });
const retain = (receipts = [input()], instanceId = "instance-a") => retainStatusReceipts({
  instanceId, receipts, receivedAt: new Date(),
}, database);
const read = async (id) => (await pg.query('SELECT * FROM "WhatsAppStatusReceipt" WHERE id=$1', [id])).rows[0];

before(async () => {
  await pg.exec('SET TIME ZONE \'UTC\'; CREATE TABLE "WhatsAppInstance" (id TEXT PRIMARY KEY);');
  await pg.exec(migration);
});
beforeEach(async () => {
  await pg.exec('TRUNCATE "WhatsAppStatusReceipt", "WhatsAppInstance" CASCADE;');
  await pg.exec('INSERT INTO "WhatsAppInstance" VALUES (\'instance-a\'), (\'instance-b\');');
  operations = 0;
});
after(() => pg.close());

test("migração é aditiva/idempotente, isolada por RLS e sem FK de conversa", async () => {
  const [{ receipt }] = await retain();
  await pg.exec(migration);
  assert.equal((await read(receipt.id)).state, "processing");
  const metadata = await pg.query(`
    SELECT c.relrowsecurity,
      (SELECT count(*)::int FROM pg_policy p WHERE p.polrelid=c.oid) AS policies,
      (SELECT count(*)::int FROM pg_constraint f WHERE f.conrelid=c.oid AND f.contype='f') AS foreign_keys
    FROM pg_class c WHERE c.relname='WhatsAppStatusReceipt'
  `);
  assert.deepEqual(metadata.rows, [{ relrowsecurity: true, policies: 0, foreign_keys: 1 }]);
  const indexes = await pg.query("SELECT indexname FROM pg_indexes WHERE tablename='WhatsAppStatusReceipt'");
  assert.equal(indexes.rows.length, 4);
  await assert.rejects(pg.query('UPDATE "WhatsAppStatusReceipt" SET state=\'unknown\' WHERE id=$1', [receipt.id]), /state_check/);
  await assert.rejects(pg.query('UPDATE "WhatsAppStatusReceipt" SET "receiptStatus"=\'SERVER_ACK\' WHERE id=$1', [receipt.id]), /status_check/);
  await assert.rejects(retain([input()], "missing-instance"), /foreign key/);
});

test("retém lote normalizado em uma operação e devolve claims só para novos recibos", async () => {
  const claims = await retain([input("DELIVERY_ACK"), input("delivered"), input("read")]);
  assert.equal(operations, 1);
  assert.equal(claims.length, 2);
  assert.deepEqual(claims.map(({ receipt }) => receipt.receiptStatus).sort(), ["delivered", "read"]);
  for (const { receipt, token } of claims) {
    assert.equal(receipt.state, "processing");
    assert.equal(receipt.attempts, 1);
    assert.equal(receipt.claimToken, token);
    assert.match(token, /^inline:/);
    assert.ok(receipt.claimedAt instanceof Date);
    assert.ok(receipt.receivedAt instanceof Date);
    assert.equal("body" in receipt, false);
    assert.equal("payload" in receipt, false);
    assert.equal("conversationId" in receipt, false);
  }
  assert.notEqual(claims[0].token, claims[1].token);
  assert.deepEqual(await retain([input("delivered"), input("read")]), []);
  const stored = await read(claims[0].receipt.id);
  assert.equal(stored.attempts, 1);
  assert.equal(stored.claimToken, claims[0].token);
});

test("identidade separa instância, JID e estágio do recibo", async () => {
  const a = await retain();
  const b = await retain([input()], "instance-b");
  const lid = await retain([input("delivered", "wa-message", "123@lid")]);
  const readReceipt = await retain([input("read")]);
  assert.equal(new Set([...a, ...b, ...lid, ...readReceipt].map(({ receipt }) => receipt.id)).size, 4);
});

test("dados inválidos e falha no INSERT não são reconhecidos como retenção", async () => {
  await assert.rejects(retain([input("invalid")]), /inválido/);
  await assert.rejects(retain([input("read", " ")]), /inválido/);
  await assert.rejects(retainStatusReceipts({ instanceId: "instance-a", receipts: [input()], receivedAt: new Date("invalid") }, database), /inválido/);
  assert.equal(operations, 0);
  assert.deepEqual(await retainStatusReceipts({ instanceId: "instance-a", receipts: [], receivedAt: new Date() }, database), []);
  await assert.rejects(retainStatusReceipts({ instanceId: "instance-a", receipts: [input()], receivedAt: new Date() }, {
    whatsAppStatusReceipt: { createManyAndReturn: async () => { throw new Error("database unavailable"); } },
  }), /database unavailable/);
});

test("claim não pega recibo fresco em processamento, vencimento futuro ou estado terminal", async () => {
  const [{ receipt, token }] = await retain();
  assert.equal(await claimStatusReceipt(database), null);
  await retryStatusReceipt(receipt, token, "message_not_found", database);
  const pending = await read(receipt.id);
  assert.equal(pending.state, "pending");
  assert.equal(pending.claimToken, null);
  assert.ok(pending.availableAt.getTime() - Date.now() >= 14_000);
  assert.equal(await claimStatusReceipt(database), null);
  await pg.query('UPDATE "WhatsAppStatusReceipt" SET "availableAt"=NOW()-interval \'1 second\' WHERE id=$1', [receipt.id]);
  const beforeClaim = operations;
  const claim = await claimStatusReceipt(database);
  assert.equal(operations - beforeClaim, 1);
  assert.equal(claim.receipt.attempts, 2);
  assert.notEqual(claim.token, token);
  assert.match(claim.token, /^worker:/);
  assert.equal(await claimStatusReceipt(database), null);
  assert.equal((await completeStatusReceipt(receipt.id, token, { outcome: "completed" }, database)).count, 0);
  assert.equal((await retryStatusReceipt(receipt, token, "stale_worker", database)).count, 0);
  assert.equal((await completeStatusReceipt(receipt.id, claim.token, { outcome: "completed" }, database)).count, 1);
  assert.equal(await claimStatusReceipt(database), null);
  assert.deepEqual(await retain(), []);
  assert.equal((await read(receipt.id)).state, "completed");
});

test("backoff é limitado, sexta tentativa termina e nunca é reenfileirada pelo replay", async () => {
  let [claim] = await retain();
  const delays = [15_000, 30_000, 60_000, 120_000, 240_000];
  for (let attempt = 1; attempt <= STATUS_RECEIPT_MAX_ATTEMPTS; attempt++) {
    const { receipt, token } = claim;
    assert.equal(receipt.attempts, attempt);
    const beforeRetry = Date.now();
    await retryStatusReceipt(receipt, token, "message_not_found", database);
    const stored = await read(receipt.id);
    if (attempt === STATUS_RECEIPT_MAX_ATTEMPTS) {
      assert.equal(stored.state, "failed");
      assert.ok(stored.completedAt instanceof Date);
      assert.equal(await claimStatusReceipt(database), null);
      assert.deepEqual(await retain(), []);
      break;
    }
    assert.equal(stored.state, "pending");
    assert.ok(stored.availableAt.getTime() >= beforeRetry + delays[attempt - 1]);
    assert.ok(stored.availableAt.getTime() <= Date.now() + delays[attempt - 1]);
    await pg.query('UPDATE "WhatsAppStatusReceipt" SET "availableAt"=NOW()-interval \'1 second\' WHERE id=$1', [receipt.id]);
    claim = await claimStatusReceipt(database);
  }
});

test("recuperação de worker interrompido é limitada a20, preserva lease atual e encerra esgotados", async () => {
  const count = STATUS_RECEIPT_RECOVERY_BATCH_SIZE + 1;
  const claims = await retain(Array.from({ length: count }, (_, index) => input("read", `message-${index}`)));
  const [fresh] = await retain([input("read", "fresh")]);
  await pg.query('UPDATE "WhatsAppStatusReceipt" SET "claimedAt"=NOW()-interval \'3 minutes\' WHERE id<>$1', [fresh.receipt.id]);
  await pg.query('UPDATE "WhatsAppStatusReceipt" SET attempts=$1 WHERE id=$2', [STATUS_RECEIPT_MAX_ATTEMPTS, claims[0].receipt.id]);
  const beforeRecover = operations;
  const first = await recoverStaleStatusReceipts(database);
  assert.equal(operations - beforeRecover, 1);
  assert.equal(first.retried + first.failed, STATUS_RECEIPT_RECOVERY_BATCH_SIZE);
  const second = await recoverStaleStatusReceipts(database);
  assert.equal(second.retried + second.failed, 1);
  assert.equal(first.failed + second.failed, 1);
  assert.equal((await read(fresh.receipt.id)).claimToken, fresh.token);
  assert.equal((await read(claims[0].receipt.id)).state, "failed");
  assert.equal((await completeStatusReceipt(claims[1].receipt.id, claims[1].token, { outcome: "completed" }, database)).count, 0);
  const recovered = await claimStatusReceipt(database);
  assert.equal(recovered.receipt.attempts, 2);
  assert.deepEqual(await recoverStaleStatusReceipts(database), { retried: 0, failed: 0 });
});

test("ambiguidade fica terminal/auditável e motivo é limitado sem apagar o recibo", async () => {
  const [{ receipt, token }] = await retain();
  await completeStatusReceipt(receipt.id, token, { outcome: "ambiguous", error: "x".repeat(2000) }, database);
  const stored = await read(receipt.id);
  assert.equal(stored.state, "ambiguous");
  assert.equal(stored.lastError.length, 1000);
  assert.equal(stored.claimToken, null);
  assert.ok(stored.completedAt instanceof Date);
  assert.equal(await claimStatusReceipt(database), null);
  assert.equal((await retryStatusReceipt(receipt, token, "late_worker", database)).count, 0);
});

test("orçamento esgotado libera lote em uma operação sem roubar claims ou reiniciar tentativas", async () => {
  const claims = await retain(Array.from({ length: 4 }, (_, index) => input("read", `batch-${index}`)));
  await completeStatusReceipt(claims[0].receipt.id, claims[0].token, { outcome: "completed" }, database);
  await pg.query('UPDATE "WhatsAppStatusReceipt" SET "claimToken"=\'worker:new-owner\', attempts=3 WHERE id=$1', [claims[1].receipt.id]);
  await pg.query('UPDATE "WhatsAppStatusReceipt" SET attempts=2 WHERE id=$1', [claims[2].receipt.id]);
  const beforeDefer = operations;
  assert.deepEqual(await deferStatusReceiptClaims(claims, "inline_budget_exhausted", database), { count: 2 });
  assert.equal(operations - beforeDefer, 1);
  assert.equal((await read(claims[0].receipt.id)).state, "completed");
  const otherOwner = await read(claims[1].receipt.id);
  assert.equal(otherOwner.state, "processing");
  assert.equal(otherOwner.claimToken, "worker:new-owner");
  const deferred = await read(claims[2].receipt.id);
  assert.equal(deferred.state, "pending");
  assert.equal(deferred.claimToken, null);
  assert.equal(deferred.claimedAt, null);
  assert.equal(deferred.lastError, "inline_budget_exhausted");
  assert.equal(deferred.attempts, 2);
  assert.ok(deferred.availableAt.getTime() <= Date.now());
  const beforeEmpty = operations;
  assert.deepEqual(await deferStatusReceiptClaims([], "empty", database), { count: 0 });
  assert.equal(operations, beforeEmpty);
});
