import assert from "node:assert/strict";
import test from "node:test";
import { runnerFixture } from "./fixtures/alice-autonomy-runner.mjs";
import { ALICE_AUTONOMY_INSTANCE_ID } from "../src/lib/ai-assistant/autonomy/policy.ts";

let currentDatabase;
globalThis.prisma = new Proxy({}, { get: (_, key) => currentDatabase?.[key] });
globalThis.fetch = async () => { throw new Error("Rede externa proibida"); };
const { claimAliceAutonomousTurn } = await import("../src/lib/ai-assistant/autonomy/queue.ts");
const { validateAliceBookingClaim } = await import("../src/lib/ai-assistant/autonomy/booking-authorization.ts");
const proof = (f, changes = {}) => ({ conversationId: f.claim.turn.conversationId, instanceId: ALICE_AUTONOMY_INSTANCE_ID,
  claim: { turnId: f.claim.turn.id, claimToken: f.claim.token, sourceMessageId: f.claim.turn.sourceMessageId }, ...changes });

test("autorização interna exige lease verdadeira e vinculada à conversa, fonte e caixa de SBC", async () => {
  const f = await runnerFixture(claimAliceAutonomousTurn);
  currentDatabase = f.adapter;
  try {
    assert.equal(await validateAliceBookingClaim(proof(f)), true);
    for (const changes of [{ conversationId: "conversation-b" }, { instanceId: "osasco-instance" },
      { claim: { ...proof(f).claim, claimToken: "forged" } }, { claim: { ...proof(f).claim, sourceMessageId: "other-message" } }]) {
      assert.equal(await validateAliceBookingClaim(proof(f, changes)), false);
    }
    await f.pg.query('UPDATE "AliceAutonomousTurn" SET "claimedAt"=NOW()-interval \'121 seconds\' WHERE id=$1', [f.claim.turn.id]);
    assert.equal(await validateAliceBookingClaim(proof(f)), false);
  } finally { await f.pg.close(); }
});

test("nova entrada, pausa global e tomada humana revogam a confirmação de agendamento", async () => {
  for (const change of [
    (f) => f.pg.query('INSERT INTO "WhatsAppMessage" (id,"conversationId","messageId",timestamp) VALUES (\'new\',\'conversation-a\',\'new\',NOW())'),
    (f) => f.pg.query('UPDATE "AppSetting" SET value=\'{"enabled":false}\' WHERE key=\'alice_autonomous_sbc_v1\''),
    (f) => f.pg.query('UPDATE "WhatsAppConversation" SET "aiMode"=\'manual\' WHERE id=\'conversation-a\''),
  ]) {
    const f = await runnerFixture(claimAliceAutonomousTurn);
    currentDatabase = f.adapter;
    try {
      assert.equal(await validateAliceBookingClaim(proof(f)), true);
      await change(f);
      assert.equal(await validateAliceBookingClaim(proof(f)), false);
    } finally { await f.pg.close(); }
  }
});
