import assert from "node:assert/strict";
import test from "node:test";
import { ALICE_AUTONOMY_INSTANCE_ID } from "../src/lib/ai-assistant/autonomy/policy.ts";
import { WELCOME_LIBRARY_USER_ID } from "../src/lib/whatsapp/campaign-welcome-policy.ts";
import { whatsAppCallbackQueueView } from "../src/lib/whatsapp/callback-queue.ts";

globalThis.prisma = {};
globalThis.fetch = async () => { throw new Error("Rede externa proibida"); };
const { handleAliceInboundReception, isFreshAliceInboundEvent } = await import("../src/lib/whatsapp/campaign-welcome-autonomy.ts");
const { processCampaignWelcomes } = await import("../src/lib/whatsapp/campaign-welcome.ts");
const { processExpiredWhatsAppCallbacks, recordOutboundForCallbackTracking } = await import("../src/lib/whatsapp/callbacks.ts");
const now = new Date("2026-11-09T04:00:00.000Z");
const input = (extra = {}) => ({ conversationId: "old-conversation", instanceId: ALICE_AUTONOMY_INSTANCE_ID,
  sourceMessageId: "internal-message-id", timestamp: new Date(now.getTime() - 5_000), receivedAt: now,
  fromMe: false, sendable: true, payload: { event: "messages.upsert", data: { type: "notify" } }, ...extra });

test("recepção consulta a posse da Alice depois de enfileirar o ID interno, inclusive em conversa antiga", async () => {
  const calls = [];
  const active = await handleAliceInboundReception(input(), {
    enqueue: async (params) => { calls.push(["enqueue", params]); return { queued: true }; },
    isActive: async (params) => { calls.push(["active", params]); return true; },
  }, now);
  assert.equal(active, true);
  assert.deepEqual(calls.map(([kind]) => kind), ["enqueue", "active"]);
  assert.equal(calls[0][1].sourceMessageId, "internal-message-id");
  assert.equal(calls[0][1].origin, "inbound");
});

test("evento repetido não decide a posse pelo retorno de enqueue nem bloqueia a próxima mensagem", async () => {
  const sources = [];
  const deps = { enqueue: async (params) => { sources.push(params.sourceMessageId); return { queued: false, reason: "sent" }; }, isActive: async () => true };
  assert.equal(await handleAliceInboundReception(input(), deps, now), true);
  assert.equal(await handleAliceInboundReception(input({ sourceMessageId: "next-internal-id" }), deps, now), true);
  assert.deepEqual(sources, ["internal-message-id", "next-internal-id"]);
});

test("histórico, status, reação, importação e eventos atrasados nunca iniciam um turno autônomo", async () => {
  const events = ["messaging-history.set", "messages.set", "messages.update", "message.ack", "reaction", "import"];
  for (const event of events) assert.equal(isFreshAliceInboundEvent(input({ payload: { event } }), now), false, event);
  assert.equal(isFreshAliceInboundEvent(input({ payload: { event: "messages.upsert", data: { type: "append" } } }), now), false);
  assert.equal(isFreshAliceInboundEvent(input({ timestamp: new Date(now.getTime() - 121_000) }), now), false);
  assert.equal(isFreshAliceInboundEvent(input({ receivedAt: new Date(now.getTime() - 121_000) }), now), false);
  let queued = 0;
  assert.equal(await handleAliceInboundReception(input({ payload: { event: "messages.set" } }), {
    enqueue: async () => { queued++; }, isActive: async () => false,
  }, now), false);
  assert.equal(queued, 0);
});

test("outra caixa e eco da própria Alice não enfileiram, não pausam nem consultam o piloto", async () => {
  const forbidden = async () => { throw new Error("O piloto não pode ser consultado aqui"); };
  for (const extra of [{ instanceId: "osasco" }, { fromMe: true }, { sendable: false }]) {
    assert.equal(await handleAliceInboundReception(input(extra), { enqueue: forbidden, isActive: forbidden }, now), false);
  }
});

test("desativada ou manual preserva a recepção, e falha de posse não libera a saudação por engano", async () => {
  assert.equal(await handleAliceInboundReception(input(), { enqueue: async () => ({ queued: false }), isActive: async () => false }, now), false);
  await assert.rejects(handleAliceInboundReception(input(), { enqueue: async () => { throw new Error("db unavailable"); }, isActive: async () => false }, now), /db unavailable/);
});

function welcomeFixture(activeAfter = 0) {
  let claimed = false, activeChecks = 0, sends = 0;
  const finished = [];
  const job = { id: "job", conversationId: "conversation", instanceId: ALICE_AUTONOMY_INSTANCE_ID, phase: 0 };
  const context = { ...job, unit: "SBC", clientUnit: "SBC", instanceUnit: "SBC", enabled: true,
    clientActive: true, capturesLeads: true, currentPhone: "5511900000000", contactPhone: "5511900000000",
    conversationStatus: "open", createdAt: new Date(now.getTime() - 60_000), campaignKey: null,
    instanceStatus: "connected", instanceName: "fixture", provider: "evolution", campaignName: null,
    triggerConfig: { libraryUserId: WELCOME_LIBRARY_USER_ID, greeting: "Olá, tudo bem?", replyIds: {} },
  };
  const database = {
    $executeRaw: async (sql) => { if (Array.isArray(sql?.values) && sql.values.includes("alice_autonomy_active")) finished.push("alice_autonomy_active"); return 1; },
    $queryRaw: async (sql) => {
      if (sql.text.includes('UPDATE "WhatsAppWelcomeJob" j')) {
        if (claimed) return []; claimed = true; return [job];
      }
      return [context];
    },
    whatsAppWelcomeJob: { findMany: async () => [], updateMany: async () => ({ count: 1 }) },
    whatsAppSavedReply: { findMany: async () => [] },
  };
  return { database, finished, send: async (params) => { await params.beforeSend(); sends++; return { messageId: "fake", sentAt: now }; },
    isAliceActive: async () => ++activeChecks > activeAfter, now: () => now, readSends: () => sends };
}

test("recepção reservada antes da ativação é cancelada sem enviar quando a Alice assumiu", async () => {
  const f = welcomeFixture();
  assert.equal((await processCampaignWelcomes(f)).cancelled, 1);
  assert.equal(f.readSends(), 0);
  assert.deepEqual(f.finished, ["alice_autonomy_active"]);
});

test("recepção revalida a posse imediatamente antes do HTTP, não só ao retirar da fila", async () => {
  const f = welcomeFixture(1);
  assert.equal((await processCampaignWelcomes(f)).cancelled, 1);
  assert.equal(f.readSends(), 0);
  assert.deepEqual(f.finished, ["alice_autonomy_active"]);
});

test("rechamada não concorre com o agente e volta a ser elegível quando a equipe assume", () => {
  const conversation = { aiMode: "agent", status: "open", callbackQueueStatus: "waiting_response",
    callbackTrackingStartedAt: new Date(now.getTime() - 86_400_000), callbackDueAt: new Date(now.getTime() - 1),
    lastInboundAt: new Date(now.getTime() - 86_400_000), lastOutboundAt: new Date(now.getTime() - 43_200_000), callbackStreakCount: 1 };
  assert.equal(whatsAppCallbackQueueView(conversation, now.getTime()), null);
  assert.equal(whatsAppCallbackQueueView({ ...conversation, aiMode: "manual" }, now.getTime()), "due");
});

test("expiração não perde automaticamente uma conversa assumida pela Alice entre seleção e escrita", async () => {
  let lost = false;
  globalThis.prisma.whatsAppConversation = {
    findMany: async ({ where }) => {
      assert.equal(where.aiMode.not, "agent");
      return [{ id: "conversation", contact: { phone: "5511900000000", unit: "SBC" }, instance: { unit: "SBC" } }];
    },
    updateMany: async ({ where, data }) => {
      // A Alice assumiu após a seleção. A condição de escrita deve revalidar isso.
      if (where.aiMode?.not === "agent") return { count: 0 };
      lost = data.status === "lost"; return { count: 1 };
    },
  };
  globalThis.prisma.$transaction = async (fn) => fn(globalThis.prisma);
  const result = await processExpiredWhatsAppCallbacks(now);
  assert.equal(result.lost, 0);
  assert.equal(result.skipped, 1);
  assert.equal(lost, false);
});

test("eco da saída autônoma não consome tentativa de rechamada nem escreve perda comercial", async () => {
  let updates = 0;
  const tx = { whatsAppConversation: { updateMany: async ({ where }) => {
    assert.equal(where.aiMode.not, "agent"); updates++; return { count: 0 };
  } } };
  assert.equal(await recordOutboundForCallbackTracking(tx, "conversation", now, { messageId: "internal-own-message", unit: "SBC" }), false);
  assert.equal(updates, 2);
});
