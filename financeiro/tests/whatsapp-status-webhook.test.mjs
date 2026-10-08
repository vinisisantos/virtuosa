import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";

registerHooks({ resolve(specifier, context, next) {
  if (specifier === "@/lib/whatsapp-call-block-sync") {
    return { url: "data:text/javascript," + encodeURIComponent("export async function ensureCallRejectApplied() {}"), shortCircuit: true };
  }
  if (specifier === "@/lib/whatsapp/inbox-realtime") {
    return { url: "data:text/javascript," + encodeURIComponent("export async function broadcastInboxRealtimeChange(change) { globalThis.broadcasts.push(change); return true; }"), shortCircuit: true };
  }
  if (specifier.startsWith(".") && context.parentURL && existsSync(new URL(`${specifier}.ts`, context.parentURL))) {
    return next(new URL(`${specifier}.ts`, context.parentURL).href, context);
  }
  return next(specifier === "next/server" ? "next/server.js" : specifier, context);
} });

let rows, logs, statusWrites, beforeWrite, messageLookups, onMessageLookup, lidLookups, onLidLookup;
const phone = "5511900000000";
const conversations = [
  { id: "chat-a", instanceId: "a", contactId: "contact" },
  { id: "chat-b", instanceId: "b", contactId: "contact" },
  { id: "chat-c", instanceId: "a", contactId: "another-contact" },
];
function matches(row, where) {
  if (where.id && row.id !== where.id) return false;
  if (where.messageId && row.messageId !== where.messageId) return false;
  if (where.fromMe !== undefined && row.fromMe !== where.fromMe) return false;
  if (where.conversation?.instanceId && conversations.find(c => c.id === row.conversationId)?.instanceId !== where.conversation.instanceId) return false;
  if (where.status?.notIn?.some(value => value.toUpperCase() === row.status.toUpperCase())) return false;
  return true;
}
globalThis.prisma = {
  whatsAppInstance: { findFirst: async ({ where }) => ({ id: where.name === "other" ? "b" : "a", name: where.name, provider: where.name === "waha" ? "waha" : "evolution" }) },
  whatsAppContact: { findUnique: async ({ where }) => where.phone === phone ? { id: "contact" } : null },
  whatsAppConversation: { findUnique: async ({ where }) => conversations.find(c => c.contactId === where.contactId_instanceId.contactId && c.instanceId === where.contactId_instanceId.instanceId) || null },
  whatsAppMessage: {
    findMany: async ({ where, take }) => {
      lidLookups++;
      if (onLidLookup) onLidLookup();
      return rows.filter(row => matches(row, where)).slice(0, take).map(row => ({ ...row }));
    },
    findUnique: async ({ where }) => {
      messageLookups++;
      if (onMessageLookup) onMessageLookup();
      const key = where.conversationId_messageId;
      const row = rows.find(row => row.conversationId === key.conversationId && row.messageId === key.messageId);
      return row ? { ...row } : null;
    },
    findFirst: async ({ where }) => { const row = rows.find(row => matches(row, where)); return row ? { ...row } : null; },
    updateMany: async ({ where, data }) => {
      statusWrites.push({ where, data });
      if (beforeWrite) { beforeWrite(); beforeWrite = null; }
      let count = 0;
      for (const row of rows) if (matches(row, where)) { Object.assign(row, data); count++; }
      return { count };
    },
  },
  webhookLog: { create: async ({ data }) => { logs.push(data); return data; } },
};
globalThis.broadcasts = [];
globalThis.fetch = async () => { throw new Error("O teste não pode acessar provedores externos"); };
const { POST } = await import("../src/app/api/whatsapp/webhook/route.ts");
beforeEach(() => {
  rows = [
    { id: "row-a", conversationId: "chat-a", messageId: "wa-id", fromMe: true, status: "sent" },
    { id: "row-b", conversationId: "chat-b", messageId: "wa-id", fromMe: true, status: "sent" },
  ];
  logs = []; statusWrites = []; beforeWrite = null; messageLookups = 0; onMessageLookup = null;
  lidLookups = 0; onLidLookup = null; globalThis.broadcasts = [];
});
const flat = status => ({ keyId: "wa-id", messageId: "provider-db-id", remoteJid: `${phone}@s.whatsapp.net`, fromMe: true, status });
async function send(data, event = "messages.update", instance = "test") {
  const response = await POST(new Request("http://localhost/api/whatsapp/webhook", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ event, instance, data }) }));
  assert.deepEqual(await response.json(), { success: true });
  assert.equal(logs.filter(log => log.status === "error").length, 0);
}

test("webhook plano Evolution atualiza só a conversa e instância corretas", async () => {
  await send(flat("DELIVERY_ACK"));
  assert.deepEqual(rows.map(row => row.status), ["delivered", "sent"]);
  await send(flat("READ"));
  assert.deepEqual(rows.map(row => row.status), ["read", "sent"]);
  assert.equal(statusWrites.length, 2);
});

test("ACK antecipado encontra o envio após persistência sem duplicar ou regredir", async () => {
  rows.shift();
  onMessageLookup = () => {
    if (messageLookups === 2) {
      rows.push({ id: "row-a", conversationId: "chat-a", messageId: "wa-id", fromMe: true, status: "pending" });
    }
  };
  await send(flat("READ"));
  assert.equal(messageLookups, 2);
  assert.deepEqual(rows.map(row => [row.conversationId, row.status]).sort(), [
    ["chat-a", "read"],
    ["chat-b", "sent"],
  ]);
  assert.equal(statusWrites.length, 1);

  await send(flat("SERVER_ACK"));
  assert.equal(rows.find(row => row.conversationId === "chat-a")?.status, "read");
  assert.equal(statusWrites.length, 1);
});

test("ACK sem mensagem limita a busca à conversa e encerra após as retentativas", async () => {
  rows.shift();
  await send(flat("DELIVERY_ACK"));
  assert.equal(messageLookups, 4);
  assert.equal(statusWrites.length, 0);
  assert.equal(rows[0].status, "sent");
  assert.equal(logs.length, 0);
});

test("arrays e eventos uppercase processam Baileys nested e ignoram ACK atrasado", async () => {
  await send([
    { key: { id: "wa-id", remoteJid: `${phone}@s.whatsapp.net`, fromMe: true }, update: { status: 4 } },
    flat("SERVER_ACK"),
  ], " MESSAGES_UPDATE ");
  assert.equal(rows[0].status, "read");
  assert.equal(statusWrites.length, 1);
});

test("LID mantém escopo, uma escrita por ACK e permite read para played", async () => {
  rows[0].status = "read";
  await send({ ...flat("PLAYED"), remoteJid: "123456789012345@lid" });
  assert.deepEqual(rows.map(row => row.status), ["played", "sent"]);
  assert.equal(statusWrites.length, 1);
  assert.deepEqual(statusWrites[0].where.conversation, { instanceId: "a" });
  assert.deepEqual(globalThis.broadcasts, [{ instanceId: "a", conversationId: "chat-a", messageId: "row-a", kind: "status" }]);
});

test("ACK LID antecipado espera o registro da própria instância e avisa sua conversa", async () => {
  rows.shift();
  onLidLookup = () => {
    if (lidLookups === 2) {
      rows.push({ id: "row-a", conversationId: "chat-a", messageId: "wa-id", fromMe: true, status: "pending" });
    }
  };
  await send({ ...flat("DELIVERY_ACK"), remoteJid: "123456789012345@lid" });
  assert.equal(lidLookups, 2);
  assert.equal(rows.find(row => row.conversationId === "chat-a")?.status, "delivered");
  assert.equal(rows.find(row => row.conversationId === "chat-b")?.status, "sent");
  assert.equal(statusWrites.length, 1);
  assert.deepEqual(globalThis.broadcasts, [{ instanceId: "a", conversationId: "chat-a", messageId: "row-a", kind: "status" }]);
});

test("ACK LID sem registro encerra após tentativas limitadas sem atualizar outra instância", async () => {
  rows.shift();
  await send({ ...flat("DELIVERY_ACK"), remoteJid: "123456789012345@lid" });
  assert.equal(lidLookups, 4);
  assert.equal(rows[0].status, "sent");
  assert.equal(statusWrites.length, 0);
  assert.deepEqual(globalThis.broadcasts, []);
});

test("ACK LID ambíguo não atualiza nem avisa conversa arbitrária", async () => {
  rows.push({ id: "row-c", conversationId: "chat-c", messageId: "wa-id", fromMe: true, status: "sent" });
  await send({ ...flat("READ"), remoteJid: "123456789012345@lid" });
  assert.equal(lidLookups, 1);
  assert.deepEqual(rows.map(row => row.status), ["sent", "sent", "sent"]);
  assert.equal(statusWrites.length, 0);
  assert.deepEqual(globalThis.broadcasts, []);
});

test("ACK LID mantém o ID selecionado se outra conversa surgir antes da escrita", async () => {
  beforeWrite = () => {
    rows.push({ id: "row-c", conversationId: "chat-c", messageId: "wa-id", fromMe: true, status: "sent" });
  };
  await send({ ...flat("READ"), remoteJid: "123456789012345@lid" });
  assert.deepEqual(rows.map(row => row.status), ["read", "sent", "sent"]);
  assert.equal(statusWrites[0].where.id, "row-a");
  assert.deepEqual(globalThis.broadcasts, [{ instanceId: "a", conversationId: "chat-a", messageId: "row-a", kind: "status" }]);
});

test("ACK LID não regride nem avisa após status concorrente superior", async () => {
  beforeWrite = () => { rows[0].status = "read"; };
  await send({ ...flat("DELIVERY_ACK"), remoteJid: "123456789012345@lid" });
  assert.deepEqual(rows.map(row => row.status), ["read", "sent"]);
  assert.equal(statusWrites.length, 1);
  assert.deepEqual(globalThis.broadcasts, []);
});

test("guarda atômica evita downgrade quando leitura chega após SELECT e antes de UPDATE", async () => {
  beforeWrite = () => { rows[0].status = "read"; };
  await send(flat("DELIVERY_ACK"));
  assert.equal(rows[0].status, "read");
  assert.equal(logs.length, 0);
});

test("ACK incoming, desconhecido ou só ID interno não altera mensagens enviadas", async () => {
  await send({ ...flat("READ"), fromMe: false });
  await send(flat("FUTURE_STATUS"));
  const internalOnly = flat("READ"); delete internalOnly.keyId;
  await send(internalOnly);
  rows[0].fromMe = false;
  await send(flat("READ"));
  assert.equal(statusWrites.length, 0);
  assert.deepEqual(rows.map(row => row.status), ["sent", "sent"]);
});

test("WAHA preserva READ diante de SERVER atrasado e ignora ACK desconhecido", async () => {
  await send({ id: "wa-id", ack: 3 }, "message.ack", "waha");
  await send({ id: "wa-id", ack: 1 }, "message.ack", "waha");
  await send({ id: "wa-id", ackName: "future-status" }, "message.ack", "waha");
  assert.deepEqual(rows.map(row => row.status), ["read", "sent"]);
  assert.equal(statusWrites.length, 1);
});

test("falha confirmada permanece até confirmação real de entrega", async () => {
  await send(flat("ERROR"));
  await send(flat("SERVER_ACK"));
  assert.equal(rows[0].status, "error");
  await send(flat("DELIVERY_ACK"));
  assert.equal(rows[0].status, "delivered");
});
