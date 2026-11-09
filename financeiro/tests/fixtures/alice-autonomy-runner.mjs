import assert from "node:assert/strict";
import { activateFixture, database, insertTurn } from "./alice-autonomy-database.mjs";
import { ALICE_AUTONOMY_INSTANCE_ID } from "../../src/lib/ai-assistant/autonomy/policy.ts";

export async function runnerFixture(claimTurn) {
  const { pg, adapter } = await database();
  const state = { clock: new Date(), generations: 0, sends: [], handoffs: [], transactionOpen: false };
  await activateFixture(pg, ALICE_AUTONOMY_INSTANCE_ID, state.clock);
  await pg.query('UPDATE "WhatsAppConversation" SET "aiMode"=\'agent\' WHERE id=\'conversation-a\'');
  await insertTurn(pg, { instanceId: ALICE_AUTONOMY_INSTANCE_ID });
  const claim = await claimTurn(adapter);
  const databaseProxy = { ...adapter, $transaction: async (operation) => adapter.$transaction(async (tx) => {
    state.transactionOpen = true;
    try { return await operation(tx); } finally { state.transactionOpen = false; }
  }) };
  const deps = {
    database: databaseProxy,
    now: () => new Date(state.clock),
    runtimeStatus: () => ({ ready: true, blockers: [] }),
    loadConfig: async () => ({ enabled: true }),
    loadContext: async (turn) => ({
      conversation: await adapter.whatsAppConversation.findFirst({ where: { id: turn.conversationId } }),
      messages: [{ fromMe: false, body: "Quero saber mais", id: "source-a" }],
      source: { id: turn.sourceMessageId, body: "Quero saber mais" },
      contactName: "Cliente de teste", handoffReason: state.handoffReason || null, prompt: {},
    }),
    generate: async () => {
      assert.equal(state.transactionOpen, false);
      state.generations++;
      await state.onGenerate?.();
      return { messages: ["Olá, sou a Alice, assistente virtual da Virtuosa.", "Você já realizou esse procedimento antes?"],
        needsHuman: false, model: "claude-sonnet-4-6", inputTokens: 1_000, outputTokens: 100,
        cacheReadInputTokens: 0, cacheCreationInputTokens: 0, costMicroUsd: 4_500, generationMs: 50, usageRecorded: true };
    },
    send: async (params) => {
      assert.equal(state.transactionOpen, false);
      await state.onBeforeSend?.();
      await params.beforeSend();
      state.sends.push(params.message);
      if (state.failSend) throw new Error("simulated network timeout after request began");
      const messageId = `provider-fixture-${state.sends.length}`;
      const sentAt = new Date(state.clock);
      await pg.query('INSERT INTO "WhatsAppMessage" (id,"conversationId","messageId","fromMe",timestamp,"createdAt","respondedByName",body) VALUES ($1,$2,$1,TRUE,$3,$3,$4,$5)',
        [messageId, params.conversationId, sentAt, params.respondedByName, params.message]);
      return { messageId, sentAt };
    },
    handoff: async (params) => { state.handoffs.push(params); },
  };
  const readTurn = async () => (await pg.query('SELECT * FROM "AliceAutonomousTurn" WHERE id=$1', [claim.turn.id])).rows[0];
  return { pg, adapter, claim, deps, state, readTurn };
}
