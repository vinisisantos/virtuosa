import assert from "node:assert/strict";
import test from "node:test";
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { database, activateFixture, insertTurn } from "./fixtures/alice-autonomy-database.mjs";
import { ALICE_AUTONOMY_INSTANCE_ID } from "../src/lib/ai-assistant/autonomy/policy.ts";
import { aliceIsAttending, inboxAttendantName, inboxMessageAuthorKey, inboxMessageAuthorName } from "../src/lib/whatsapp/inbox-attendant.ts";

globalThis.prisma = {};
registerHooks({ resolve(specifier, context, next) {
  if (specifier.startsWith(".") && context.parentURL?.startsWith("file:")) {
    const source = new URL(`${specifier}.ts`, context.parentURL);
    if (existsSync(source)) return next(source.href, context);
  }
  return next(specifier, context);
} });
const { aliceAttendingConversationIds } = await import("../src/lib/ai-assistant/autonomy/inbox-attendance.ts");

test("Alice só substitui o atendente visual com prova de atendimento e modo autônomo ainda ativo", () => {
  const conversation = { assignedToName: "Claudenice", aiMode: "agent", aliceAttending: true };
  assert.equal(aliceIsAttending(conversation), true);
  assert.equal(inboxAttendantName(conversation), "Alice");
  for (const changes of [{ aiMode: "manual" }, { aiMode: "suggestions" }, { aliceAttending: false }, { aliceAttending: undefined }]) {
    assert.equal(aliceIsAttending({ ...conversation, ...changes }), false);
    assert.equal(inboxAttendantName({ ...conversation, ...changes }), "Claudenice");
  }
});

test("autores de automações consecutivas não escondem o nome da Alice; operadores humanos continuam distintos", () => {
  const welcome = { respondedByName: "Automação de recepção", respondedBy: null };
  const alice = { respondedByName: "Alice", respondedBy: null };
  assert.notEqual(inboxMessageAuthorKey(welcome), inboxMessageAuthorKey(alice));
  assert.equal(inboxMessageAuthorKey(alice), inboxMessageAuthorKey({ respondedByName: "Alice (automação)" }));
  assert.equal(inboxMessageAuthorName({ respondedByName: "Alice (automação)" }), "Alice");
  assert.notEqual(inboxMessageAuthorKey(alice), inboxMessageAuthorKey({ respondedBy: "claudenice", respondedByName: "Claudenice" }));
  assert.notEqual(inboxMessageAuthorKey({ respondedBy: "one", respondedByName: "Ana" }), inboxMessageAuthorKey({ respondedBy: "two", respondedByName: "Ana" }));
  assert.equal(inboxMessageAuthorName({ respondedByName: "Automação de agendamento" }), "Automação de agendamento");
});

test("lista usa uma única consulta limitada aos chats autônomos da caixa SBC e exige saída na ativação atual", async () => {
  const { pg, adapter } = await database();
  const now = new Date();
  try {
    await activateFixture(pg, ALICE_AUTONOMY_INSTANCE_ID, now);
    await pg.query('UPDATE "WhatsAppConversation" SET "aiMode"=\'agent\', "aiModeUpdatedAt"=$1 WHERE id=\'conversation-a\'', [new Date(now.getTime() - 10_000)]);
    await insertTurn(pg, { instanceId: ALICE_AUTONOMY_INSTANCE_ID });
    const conversations = [{ id: "conversation-a", instanceId: ALICE_AUTONOMY_INSTANCE_ID, aiMode: "agent" }, { id: "conversation-b", instanceId: "instance-b", aiMode: "agent" }];
    let queries = 0;
    const db = { $queryRaw: (...args) => { queries++; return adapter.$queryRaw(...args); } };
    assert.equal((await aliceAttendingConversationIds(conversations, db)).size, 0, "inscrição sem resposta não é atendimento");
    await pg.query('UPDATE "AliceAutonomousTurn" SET "firstSentAt"=$1', [now]);
    assert.deepEqual([...await aliceAttendingConversationIds(conversations, db)], ["conversation-a"]);
    assert.equal(queries, 2, "uma consulta por atualização, não uma por conversa");
    for (const update of [
      '"aiMode"=\'manual\'', '"blockedAt"=NOW()', '"archivedAt"=NOW()', '"commercialPaused"=TRUE',
      'status=\'closed\'', '"aiModeUpdatedAt"=NOW()+interval \'1 hour\'',
    ]) {
      await pg.exec(`UPDATE "WhatsAppConversation" SET "aiMode"='agent', "blockedAt"=NULL, "archivedAt"=NULL, "commercialPaused"=FALSE, status='open', "aiModeUpdatedAt"=NULL WHERE id='conversation-a'`);
      await pg.exec(`UPDATE "WhatsAppConversation" SET ${update} WHERE id='conversation-a'`);
      assert.equal((await aliceAttendingConversationIds(conversations, db)).size, 0, update);
    }
    const before = queries;
    assert.equal((await aliceAttendingConversationIds([conversations[1]], db)).size, 0);
    assert.equal((await aliceAttendingConversationIds([{ ...conversations[0], aiMode: "manual" }], db)).size, 0);
    assert.equal(queries, before, "outras unidades e modo manual não acrescentam consulta");
  } finally { await pg.close(); }
});
