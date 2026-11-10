import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { Prisma } from "@prisma/client";
import { unreadCountForNewWhatsAppMessage } from "../src/lib/ai-assistant/autonomy/echo-unread.ts";
import { ALICE_AUTONOMY_INSTANCE_ID } from "../src/lib/ai-assistant/autonomy/policy.ts";

const instance = { id: ALICE_AUTONOMY_INSTANCE_ID, unit: "SBC", name: "fixture", provider: "evolution" };
const echo = { dbInstance: instance, conversation: { id: "chat", aiMode: "agent" }, isSendablePhone: true, isFromMe: true };
const noQuery = { $queryRaw() { assert.fail("Não deveria consultar a fila"); } };

test("entradas, números técnicos, caixa manual e outras instâncias preservam regras sem consultar a fila", async () => {
  assert.deepEqual(await unreadCountForNewWhatsAppMessage({ ...echo, isFromMe: false }, noQuery), { increment: 1 });
  for (const overrides of [{ isSendablePhone: false }, { dbInstance: { ...instance, id: "outra" } },
    { dbInstance: { ...instance, unit: "Osasco" } }, { conversation: { id: "chat", aiMode: "manual" } }]) {
    assert.equal(await unreadCountForNewWhatsAppMessage({ ...echo, ...overrides }, noQuery), 0);
  }
});

test("só o eco ambíguo durante envio autônomo ou confirmação da mesma fonte preserva não lidas", async () => {
  const pg = new PGlite();
  try {
    await pg.exec(`CREATE TABLE "AliceAutonomousTurn" ("instanceId" text, "conversationId" text, "claimToken" text, status text, "sourceMessageId" text);
      CREATE TABLE "AliceAutoSchedule" ("conversationId" text,"replyMessageId" text,state text);`);
    const tx = { $queryRaw: async (strings, ...values) => {
      const sql = Prisma.sql(strings, ...values);
      return (await pg.query(sql.text, sql.values)).rows;
    } };
    const read = () => unreadCountForNewWhatsAppMessage(echo, tx);
    await pg.query('INSERT INTO "AliceAutonomousTurn" VALUES ($1,$2,$3,$4,$5)', [instance.id, "chat", "lease", "processing", "source"]);
    assert.equal(await read(), 0);
    await pg.exec(`INSERT INTO "AliceAutoSchedule" VALUES ('chat','older-source','sending'),('other','source','sending'),('chat','source','submitted')`);
    assert.equal(await read(), 0);
    await pg.exec(`UPDATE "AliceAutoSchedule" SET state='sending' WHERE "conversationId"='chat' AND "replyMessageId"='source'`);
    assert.equal(await read(), undefined);
    await pg.exec(`DELETE FROM "AliceAutoSchedule"; UPDATE "AliceAutonomousTurn" SET status='sending'`);
    assert.equal(await read(), undefined);
    await pg.exec(`UPDATE "AliceAutonomousTurn" SET status='queued'`);
    assert.equal(await read(), 0);
    await pg.exec(`UPDATE "AliceAutonomousTurn" SET status='sending', "claimToken"=NULL`);
    assert.equal(await read(), 0);
  } finally { await pg.close(); }
});

test("eco antes do retorno reutiliza apenas a mesma saída sem trocar ACK nem reenviar", async () => {
  const sendParams = { dbInstance: instance, aliceAutonomous: true, conversationId: "chat", contactPhone: "5511900001111", message: "Olá!" };
  let status = "read", duplicate = true, requests = 0, links = 0, visibleUpdates = 0, owner = null;
  globalThis.prisma = {
    whatsAppConversation: { findUnique: async () => ({ blockedAt: null }), update: async () => { visibleUpdates++; } },
    whatsAppMessage: {
      create: async ({ data }) => {
        if (duplicate) throw Object.assign(new Error("Já inserida"), { code: "P2002" });
        assert.equal(data.respondedByName, "Alice");
        return { id: "new-row", status: "sent" };
      },
      update: async ({ where, data }) => {
        assert.deepEqual(where.conversationId_messageId, { conversationId: "chat", messageId: "provider-id" });
        assert.equal(where.fromMe, true); assert.equal(where.respondedBy, null);
        assert.deepEqual(where.OR, [{ respondedByName: null }, { respondedByName: "Alice" }]);
        assert.deepEqual(data, { respondedByName: "Alice" });
        if (owner !== null) throw Object.assign(new Error("Autoria de outra pessoa"), { code: "P2025" });
        links++;
        return { id: "echo-row", status };
      },
    },
  };
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => { requests++; return Response.json({ key: { id: "provider-id" } }); };
  try {
    const { sendAutomationText } = await import("../src/lib/whatsapp/automation-sender.ts");
    const result = await sendAutomationText(sendParams);
    assert.equal(result.messageRowId, "echo-row");
    assert.equal(result.messageId, "provider-id");
    assert.equal(requests, 1); assert.equal(links, 1); assert.equal(visibleUpdates, 1);
    owner = "pessoa";
    await assert.rejects(sendAutomationText(sendParams), { code: "P2025" });
    owner = null; status = "error";
    await assert.rejects(sendAutomationText(sendParams), /não repetir/);
    await assert.rejects(sendAutomationText({ ...sendParams, aliceAutonomous: false }), { code: "P2002" });
    assert.equal(requests, 4); assert.equal(links, 2); assert.equal(visibleUpdates, 1);
    duplicate = false;
    assert.equal((await sendAutomationText(sendParams)).messageRowId, "new-row");
    await assert.rejects(sendAutomationText({ ...sendParams, dbInstance: { ...instance, id: "outra" } }), /fora do piloto/);
    assert.equal(requests, 5);
  } finally { globalThis.fetch = previousFetch; delete globalThis.prisma; }
});
