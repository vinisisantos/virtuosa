import assert from "node:assert/strict";
import test from "node:test";

import {
  PENDING_CONFIRMATION_WARNING_MS,
  PENDING_RECONCILIATION_FIRST_MS,
  PENDING_RECONCILIATION_SECOND_MS,
  pendingReconciliationKey,
  pendingReconciliationRetryDelayMs,
  planPendingMessageReconciliation,
  releaseSkippedPendingCheck,
} from "../src/lib/whatsapp/pending-message-reconciliation.ts";

const now = Date.parse("2026-10-08T15:00:00.000Z");
const pending = (id, age, overrides = {}) => ({
  fromMe: true,
  status: "pending",
  timestamp: new Date(now - age).toISOString(),
  messageId: id,
  ...overrides,
});

test("agenda somente duas janelas de consulta para uma mensagem ainda pendente", () => {
  const message = pending("wa-1", 10_000);
  const initial = planPendingMessageReconciliation("conv-1", [message], new Map(), now);
  assert.equal(initial.nextCheck, null);
  assert.equal(initial.nextWakeAt, now + 20_000);

  const first = planPendingMessageReconciliation("conv-1", [pending("wa-1", 30_000)], new Map(), now);
  assert.deepEqual(first.nextCheck, { messageId: "wa-1", checkpoint: 1 });

  const attempted = new Map([[pendingReconciliationKey("conv-1", "wa-1"), 1]]);
  const waiting = planPendingMessageReconciliation("conv-1", [pending("wa-1", 30_000)], attempted, now);
  assert.equal(waiting.nextCheck, null);
  assert.equal(waiting.nextWakeAt, now + PENDING_CONFIRMATION_WARNING_MS - PENDING_RECONCILIATION_FIRST_MS);

  const second = planPendingMessageReconciliation("conv-1", [pending("wa-1", 180_000)], attempted, now);
  assert.deepEqual(second.nextCheck, { messageId: "wa-1", checkpoint: 2 });
  attempted.set(pendingReconciliationKey("conv-1", "wa-1"), 2);
  assert.equal(planPendingMessageReconciliation("conv-1", [pending("wa-1", 200_000)], attempted, now).nextCheck, null);
});

test("aba reaberta após três minutos conserva duas chances de checagem com cooldown", () => {
  const message = pending("wa-1", PENDING_RECONCILIATION_SECOND_MS + 1);
  const first = planPendingMessageReconciliation("conv-1", [message], new Map(), now);
  assert.deepEqual(first.nextCheck, { messageId: "wa-1", checkpoint: 1 });
  assert.equal(first.hasProlongedPending, true);

  const attempted = new Map([[pendingReconciliationKey("conv-1", "wa-1"), 1]]);
  const duringCooldown = planPendingMessageReconciliation("conv-1", [message], attempted, now, now + 30_000);
  assert.equal(duringCooldown.nextCheck, null);
  assert.equal(duringCooldown.nextWakeAt, now + 30_000);

  const second = planPendingMessageReconciliation("conv-1", [message], attempted, now + 30_000, now + 30_000);
  assert.deepEqual(second.nextCheck, { messageId: "wa-1", checkpoint: 2 });
});

test("prioriza a mensagem mais recente e serializa backlog por conversa", () => {
  const messages = [pending("wa-old", 80_000), pending("wa-new", 40_000)];
  const first = planPendingMessageReconciliation("conv-1", messages, new Map(), now);
  assert.deepEqual(first.nextCheck, { messageId: "wa-new", checkpoint: 1 });

  const attempted = new Map([[pendingReconciliationKey("conv-1", "wa-new"), 1]]);
  const limited = planPendingMessageReconciliation("conv-1", messages, attempted, now, now + 30_000);
  assert.equal(limited.nextCheck, null);
  assert.equal(limited.nextWakeAt, now + 30_000);
});

test("não consulta recebidas, entregues, somente leitura ou balão otimista sem ID", () => {
  const messages = [
    pending("inbound", 40_000, { fromMe: false }),
    pending("delivered", 40_000, { status: "delivered" }),
    pending("history", 40_000, { readOnly: true }),
    pending(undefined, 40_000),
  ];
  const plan = planPendingMessageReconciliation("conv-1", messages, new Map(), now);
  assert.equal(plan.nextCheck, null);
  assert.equal(plan.hasProlongedPending, false);
});

test("aviso surge após dois minutos sem chamar isso de falha ou entrega", () => {
  const before = planPendingMessageReconciliation("conv-1", [pending("wa-1", PENDING_CONFIRMATION_WARNING_MS - 1)], new Map(), now);
  assert.equal(before.hasProlongedPending, false);
  assert.equal(before.nextWakeAt, now + 1);

  const after = planPendingMessageReconciliation("conv-1", [pending("wa-1", PENDING_CONFIRMATION_WARNING_MS)], new Map(), now);
  assert.equal(after.hasProlongedPending, true);
});

test("throttle ou pending recente não gastam checkpoint e só reagem após prazo", () => {
  const message = pending("wa-1", PENDING_RECONCILIATION_SECOND_MS + 1);
  const attempts = new Map([[pendingReconciliationKey("conv-1", "wa-1"), 1]]);
  releaseSkippedPendingCheck(attempts, "conv-1", { messageId: "wa-1", checkpoint: 1 });
  assert.equal(attempts.has(pendingReconciliationKey("conv-1", "wa-1")), false);

  const retryAt = now + pendingReconciliationRetryDelayMs(30_000);
  const waiting = planPendingMessageReconciliation("conv-1", [message], attempts, now, retryAt);
  assert.equal(waiting.nextCheck, null);
  assert.equal(waiting.nextWakeAt, retryAt);
  assert.deepEqual(
    planPendingMessageReconciliation("conv-1", [message], attempts, retryAt, retryAt).nextCheck,
    { messageId: "wa-1", checkpoint: 1 },
  );

  attempts.set(pendingReconciliationKey("conv-1", "wa-1"), 2);
  releaseSkippedPendingCheck(attempts, "conv-1", { messageId: "wa-1", checkpoint: 2 });
  assert.equal(attempts.get(pendingReconciliationKey("conv-1", "wa-1")), 1);
  assert.equal(pendingReconciliationRetryDelayMs(0), 30_000);
  assert.equal(pendingReconciliationRetryDelayMs(undefined), 30_000);
});
