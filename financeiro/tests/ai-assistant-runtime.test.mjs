import assert from "node:assert/strict";
import test from "node:test";
import { aliceRuntimeStatus, requireAliceLiveRuntime } from "#lib/ai-assistant/runtime";

const GATE_KEYS = [
  "ALICE_HERMES_BRIDGE_URL",
  "ALICE_HERMES_BRIDGE_SECRET",
  "ALICE_OWNER_USER_ID",
  "ALICE_CONVERSATION_DATA_APPROVED",
  "ALICE_ENABLE_LIVE_SUGGESTIONS",
];

test("Alice falha fechada sem base, credenciais e autorização explícita", () => {
  const previous = Object.fromEntries(GATE_KEYS.map((key) => [key, process.env[key]]));
  try {
    for (const key of GATE_KEYS) delete process.env[key];
    const status = aliceRuntimeStatus();
    assert.equal(status.ready, false);
    assert.equal(status.privateKnowledge, false);
    assert.equal(status.hermesBridgeConfigured, false);
    assert.equal(status.ownerConfigured, false);
    assert.equal(status.conversationDataApproved, false);
    assert.equal(status.liveSuggestionsEnabled, false);
    assert.throws(() => requireAliceLiveRuntime(), /não está habilitada/);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
