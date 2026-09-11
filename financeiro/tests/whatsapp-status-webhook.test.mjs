import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";

registerHooks({ resolve(specifier, context, next) {
  if (specifier === "@/lib/whatsapp-call-block-sync") {
    return { url: "data:text/javascript," + encodeURIComponent("export async function ensureCallRejectApplied() {}"), shortCircuit: true };
  }
  if (specifier.startsWith(".") && context.parentURL && existsSync(new URL(`${specifier}.ts`, context.parentURL))) {
    return next(new URL(`${specifier}.ts`, context.parentURL).href, context);
  }
  return next(specifier === "next/server" ? "next/server.js" : specifier, context);
} });

let rows, logs, statusWrites, beforeWrite;
const phone = "5511900000000";
const conversations = [{ id: "chat-a", instanceId: "a", contactId: "contact" }, { id: "chat-b", instanceId: "b", contactId: "contact" }];
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
    findUnique: async ({ where }) => {
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
globalThis.fetch = async () => { throw new Error("O teste não pode acessar provedores externos"); };
const { POST } = await import("../src/app/api/whatsapp/webhook/route.ts");
beforeEach(() => {
  rows = [
    { id: "row-a", conversationId: "chat-a", messageId: "wa-id", fromMe: true, status: "sent" },
    { id: "row-b", conversationId: "chat-b", messageId: "wa-id", fromMe: true, status: "sent" },
  ];
  logs = []; statusWrites = []; beforeWrite = null;
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
