import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";

registerHooks({ resolve(specifier, context, next) {
  if (specifier === "@/lib/whatsapp/instance-resolver") {
    return {
      url: "data:text/javascript," + encodeURIComponent(
        "export async function getInstancesForRequest() { return { instances: globalThis.testInstances }; }",
      ),
      shortCircuit: true,
    };
  }
  if (specifier === "@/lib/whatsapp/inbox-realtime") {
    return {
      url: "data:text/javascript," + encodeURIComponent(
        "export async function broadcastInboxRealtimeChange(change) { globalThis.broadcasts.push(change); return true; }",
      ),
      shortCircuit: true,
    };
  }
  if (specifier.startsWith(".") && context.parentURL && existsSync(new URL(`${specifier}.ts`, context.parentURL))) {
    return next(new URL(`${specifier}.ts`, context.parentURL).href, context);
  }
  return next(specifier === "next/server" ? "next/server.js" : specifier, context);
} });

process.env.EVOLUTION_API_URL = "https://provider.invalid";
process.env.EVOLUTION_API_KEY = "test-key";

const conversationId = "conversation-a";
const messageId = "wa-message-a";
const phone = "5511900000000";
let message, logs, providerPayload, providerHttpStatus, providerCalls, updateCalls, readCalls, forceDuplicateClaim, testUnit;
globalThis.broadcasts = [];
globalThis.testInstances = [{ id: "instance-a", status: "connected", canView: true }];

globalThis.prisma = {
  whatsAppConversation: {
    findFirst: async ({ where }) => {
      if (where.id !== conversationId || !where.instanceId.in.includes("instance-a")) return null;
      return {
        id: conversationId,
        lastKnownJid: `${phone}@s.whatsapp.net`,
        contact: { phone },
        instance: { id: "instance-a", name: "test-instance", provider: "evolution", unit: testUnit },
      };
    },
  },
  whatsAppMessage: {
    findUnique: async ({ where }) => {
      readCalls++;
      if (where.conversationId_messageId) {
        const key = where.conversationId_messageId;
        return key.conversationId === conversationId && key.messageId === messageId ? { ...message } : null;
      }
      return where.id === message.id ? { status: message.status } : null;
    },
    updateMany: async ({ where, data }) => {
      updateCalls++;
      if (where.id !== message.id || !where.fromMe || message.status !== "pending") return { count: 0 };
      message.status = data.status;
      return { count: 1 };
    },
  },
  webhookLog: {
    findFirst: async ({ where }) => logs.find((entry) =>
      entry.payload.includes(where.payload.contains)
      && entry.createdAt >= where.createdAt.gte,
    ) || null,
    create: async ({ data }) => {
      if (forceDuplicateClaim || logs.some((entry) => entry.id === data.id)) {
        throw Object.assign(new Error("Duplicated claim"), { code: "P2002" });
      }
      const entry = { createdAt: new Date(), ...data };
      logs.push(entry);
      return { id: entry.id };
    },
    update: async ({ where, data }) => {
      Object.assign(logs.find((entry) => entry.id === where.id), data);
      return {};
    },
  },
};

globalThis.fetch = async (_url, options) => {
  providerCalls++;
  assert.equal(options.method, "POST");
  assert.equal(JSON.parse(options.body).where.key.id, messageId);
  return { ok: providerHttpStatus === 200, status: providerHttpStatus, json: async () => providerPayload };
};

const { POST } = await import("../src/app/api/whatsapp/messages/reconcile/route.ts");

beforeEach(() => {
  message = {
    id: "db-message-a",
    fromMe: true,
    status: "pending",
    timestamp: new Date(Date.now() - 40_000),
  };
  logs = [];
  providerHttpStatus = 200;
  providerPayload = {
    messages: { records: [{
      key: { id: messageId, fromMe: true, remoteJid: `${phone}@s.whatsapp.net` },
      message: { conversation: "teste" },
      MessageUpdate: [{ status: "SERVER_ACK" }, { status: "DELIVERY_ACK" }],
    }] },
  };
  providerCalls = updateCalls = readCalls = 0;
  forceDuplicateClaim = false;
  testUnit = "SBC";
  globalThis.broadcasts = [];
  globalThis.testInstances = [{ id: "instance-a", status: "connected", canView: true }];
});

async function reconcile(input = { conversationId, messageId }) {
  const response = await POST(new Request("http://localhost/api/whatsapp/messages/reconcile", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  }));
  return { httpStatus: response.status, body: await response.json() };
}

test("consulta a Evolution só para pending antigo e promove entrega com escopo da conversa", async () => {
  const result = await reconcile();
  assert.equal(result.httpStatus, 200);
  assert.deepEqual(result.body, { checked: true, providerFound: true, status: "delivered" });
  assert.equal(message.status, "delivered");
  assert.equal(providerCalls, 1);
  assert.equal(updateCalls, 1);
  assert.equal(globalThis.broadcasts.length, 1);
  assert.equal(logs[0].status, "processed");
});

test("não confunde mesmo messageId de outro contato nem inventa confirmação", async () => {
  providerPayload.messages.records[0].key.remoteJid = "5511800000000@s.whatsapp.net";
  const result = await reconcile();
  assert.deepEqual(result.body, { checked: true, providerFound: false, status: "pending" });
  assert.equal(message.status, "pending");
  assert.equal(updateCalls, 0);
  assert.equal(globalThis.broadcasts.length, 0);
});

test("não promove envio quando a Evolution não possui recibo consultável", async () => {
  providerPayload.messages.records[0].MessageUpdate = [];
  const result = await reconcile();
  assert.deepEqual(result.body, { checked: true, providerFound: true, status: "pending" });
  assert.equal(updateCalls, 0);
  assert.equal(globalThis.broadcasts.length, 0);
});

test("mantém a leitura antiga fora da unidade canário", async () => {
  testUnit = "Osasco";
  const result = await reconcile();
  assert.deepEqual(result.body, { checked: true, providerFound: true, status: "pending" });
  assert.equal(updateCalls, 0);
});

test("não aceita outro DDI com os mesmos dez dígitos finais", async () => {
  providerPayload.messages.records[0].key.remoteJid = `1${phone}@s.whatsapp.net`;
  const result = await reconcile();
  assert.deepEqual(result.body, { checked: true, providerFound: false, status: "pending" });
  assert.equal(updateCalls, 0);
});

test("aceita ACK LID somente quando o JID alternativo identifica o contato", async () => {
  providerPayload.messages.records[0].key.remoteJid = "123456789@lid";
  providerPayload.messages.records[0].key.remoteJidAlt = `${phone}@s.whatsapp.net`;
  assert.equal((await reconcile()).body.status, "delivered");
  assert.equal(updateCalls, 1);
});

test("não associa recibo LID sem telefone correspondente nem mensagem de entrada", async () => {
  providerPayload.messages.records[0].key.remoteJid = "123456789@lid";
  providerPayload.messages.records[0].key.remoteJidAlt = "5511800000000@s.whatsapp.net";
  assert.equal((await reconcile()).body.status, "pending");
  assert.equal(updateCalls, 0);

  logs = [];
  providerPayload.messages.records[0].key.remoteJid = `${phone}@s.whatsapp.net`;
  providerPayload.messages.records[0].key.fromMe = false;
  assert.equal((await reconcile()).body.status, "pending");
  assert.equal(updateCalls, 0);
});

test("não usa recibo de outro ID da mesma conversa", async () => {
  providerPayload.messages.records[0].key.id = "other-message";
  assert.deepEqual((await reconcile()).body, { checked: true, providerFound: false, status: "pending" });
  assert.equal(updateCalls, 0);
});

test("não consulta provedor para mensagem recente, já confirmada ou sem acesso", async () => {
  message.timestamp = new Date();
  assert.equal((await reconcile()).body.checked, false);
  message.timestamp = new Date(Date.now() - 40_000);
  message.status = "read";
  assert.equal((await reconcile()).body.status, "read");
  message.status = "pending";
  globalThis.testInstances = [];
  assert.equal((await reconcile()).httpStatus, 403);
  assert.equal(providerCalls, 0);
});

test("limita consultas repetidas sem reenvio e preserva pendência em erro do provedor", async () => {
  assert.equal((await reconcile()).body.status, "delivered");
  assert.equal(providerCalls, 1);
  message.status = "pending";
  assert.equal((await reconcile()).body.throttled, true);
  assert.equal(providerCalls, 1);
  logs = [];
  providerHttpStatus = 503;
  const failed = await reconcile();
  assert.equal(failed.httpStatus, 502);
  assert.equal(message.status, "pending");
  assert.equal(logs[0].status, "error");
});

test("claim único bloqueia corrida entre abas antes de consultar o provedor", async () => {
  forceDuplicateClaim = true;
  const result = await reconcile();
  assert.equal(result.httpStatus, 200);
  assert.equal(result.body.throttled, true);
  assert.equal(result.body.retryAfterMs, 30_000);
  assert.equal(providerCalls, 0);
});
