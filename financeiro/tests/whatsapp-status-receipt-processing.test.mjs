import assert from "node:assert/strict";
import test, { beforeEach, afterEach, mock } from "node:test";
import { registerHooks } from "node:module";
import { readFile } from "node:fs/promises";

registerHooks({ resolve(specifier, context, next) {
  if (specifier === "@/lib/whatsapp/inbox-realtime") {
    return { url: "data:text/javascript," + encodeURIComponent(
      "export async function broadcastInboxRealtimeChange(change) { globalThis.receiptBroadcasts.push(change); return globalThis.receiptBroadcastResult; }",
    ), shortCircuit: true };
  }
  return next(specifier, context);
} });

const phone = "5511999990000";
const conversations = [
  { id: "chat-a", instanceId: "instance-a", phone },
  { id: "chat-b", instanceId: "instance-b", phone },
  { id: "chat-other", instanceId: "instance-a", phone: "5511888880000" },
  { id: "chat-variant", instanceId: "instance-a", phone: "551199990000" },
];
let messages, receipts, lookups, updates, transitions, beforeUpdate, failure, externalCalls;
globalThis.receiptBroadcasts = [];
globalThis.receiptBroadcastResult = true;
const previousFetch = globalThis.fetch;

function matches(message, where) {
  if (where.id && message.id !== where.id) return false;
  if (where.conversationId && message.conversationId !== where.conversationId) return false;
  if (where.messageId && message.messageId !== where.messageId) return false;
  if (where.fromMe !== undefined && message.fromMe !== where.fromMe) return false;
  const conversation = conversations.find((item) => item.id === message.conversationId);
  if (where.conversation?.instanceId && conversation.instanceId !== where.conversation.instanceId) return false;
  if (where.conversation?.contact?.phone?.in && !where.conversation.contact.phone.in.includes(conversation.phone)) return false;
  return !where.status?.notIn?.some((status) => status.toLowerCase() === message.status.toLowerCase());
}

globalThis.prisma = {
  whatsAppMessage: {
    findMany: async (query) => {
      lookups.push(query);
      if (failure === "lookup") throw new Error("synthetic lookup failure");
      return messages.filter((row) => matches(row, query.where)).slice(0, query.take).map((row) => ({ ...row }));
    },
    updateMany: async ({ where, data }) => {
      updates.push({ where, data });
      if (beforeUpdate) { const callback = beforeUpdate; beforeUpdate = null; callback(); }
      if (failure === "message-update") throw new Error("synthetic update failure");
      let count = 0;
      for (const row of messages) if (matches(row, where)) { Object.assign(row, data); count++; }
      return { count };
    },
  },
  whatsAppStatusReceipt: {
    updateMany: async ({ where, data }) => {
      transitions.push({ where, data });
      if (failure === "receipt-storage") throw new Error("synthetic receipt storage failure");
      const receipt = receipts.find((row) => row.id === where.id && row.claimToken === where.claimToken && row.state === where.state);
      if (!receipt) return { count: 0 };
      Object.assign(receipt, data);
      return { count: 1 };
    },
  },
};

const { processStatusReceipt, normalizeReceiptJid, isStatusReceiptPilot, applyObservedMessageStatus } = await import("../src/lib/whatsapp/status-receipt-processing.ts");
const claim = (overrides = {}) => {
  const receipt = {
    id: `receipt-${receipts.length + 1}`, instanceId: "instance-a", messageId: "wa-id",
    remoteJid: `${phone}@s.whatsapp.net`, receiptStatus: "delivered", attempts: 1,
    state: "processing", claimToken: `claim-${receipts.length + 1}`,
    receivedAt: new Date(Date.now() - 1_000), availableAt: new Date(), ...overrides,
  };
  receipts.push(receipt);
  return { receipt: { ...receipt }, token: receipt.claimToken };
};

beforeEach(() => {
  messages = [
    { id: "row-a", conversationId: "chat-a", messageId: "wa-id", status: "pending", fromMe: true },
    { id: "row-b", conversationId: "chat-b", messageId: "wa-id", status: "pending", fromMe: true },
    { id: "row-other", conversationId: "chat-other", messageId: "wa-id", status: "pending", fromMe: true },
  ];
  receipts = []; lookups = []; updates = []; transitions = []; beforeUpdate = null; failure = null; externalCalls = 0;
  globalThis.receiptBroadcasts = []; globalThis.receiptBroadcastResult = true;
  globalThis.fetch = async () => { externalCalls++; throw new Error("Sem acesso externo no teste"); };
  mock.method(console, "info", () => {});
  mock.method(console, "warn", () => {});
});
afterEach(() => { assert.equal(externalCalls, 0); globalThis.fetch = previousFetch; mock.restoreAll(); });

test("PN aplica somente a mensagem da instância e contato do recibo e publica após completar", async () => {
  const pending = claim();
  assert.equal(await processStatusReceipt(pending), "completed");
  assert.deepEqual(messages.map((row) => row.status), ["delivered", "pending", "pending"]);
  assert.equal(lookups.length, 1);
  assert.equal(lookups[0].take, 2);
  assert.deepEqual(lookups[0].where.conversation, { instanceId: "instance-a", contact: { phone: { in: [phone, "551199990000"] } } });
  assert.equal(receipts[0].state, "completed");
  assert.equal(updates[0].where.conversationId, "chat-a");
  assert.deepEqual(globalThis.receiptBroadcasts, [{ instanceId: "instance-a", conversationId: "chat-a", messageId: "row-a", kind: "status" }]);
});

test("PN aceita variante brasileira do nono dígito sem confundir contato diferente", async () => {
  messages[0].conversationId = "chat-variant";
  assert.equal(await processStatusReceipt(claim()), "completed");
  assert.deepEqual(messages.map((row) => row.status), ["delivered", "pending", "pending"]);
  assert.equal(globalThis.receiptBroadcasts[0].conversationId, "chat-variant");
});

test("duas conversas PN compatíveis não escolhem destino arbitrário", async () => {
  messages.push({ id: "row-variant", conversationId: "chat-variant", messageId: "wa-id", status: "pending", fromMe: true });
  assert.equal(await processStatusReceipt(claim()), "ambiguous");
  assert.equal(receipts[0].state, "ambiguous");
  assert.equal(receipts[0].lastError, "multiple_matching_conversations");
  assert.equal(updates.length, 0);
  assert.equal(globalThis.receiptBroadcasts.length, 0);
});

test("LID não vira telefone; resolve somente correspondência única na instância", async () => {
  messages.pop();
  assert.equal(await processStatusReceipt(claim({ remoteJid: "123456789@hosted.lid" })), "completed");
  assert.deepEqual(lookups[0].where.conversation, { instanceId: "instance-a" });
  assert.deepEqual(messages.map((row) => row.status), ["delivered", "pending"]);
});

test("LID com ID repetido dentro da instância fica ambíguo e não publica", async () => {
  assert.equal(await processStatusReceipt(claim({ remoteJid: "123456789@lid" })), "ambiguous");
  assert.equal(updates.length, 0);
  assert.equal(globalThis.receiptBroadcasts.length, 0);
  assert.equal(receipts[0].state, "ambiguous");
});

test("ACK antes de persistir mensagem é retido e aplicado por claim posterior sem reenviar", async () => {
  messages.shift();
  const pending = claim();
  assert.equal(await processStatusReceipt(pending), "pending");
  assert.equal(receipts[0].state, "pending");
  assert.equal(receipts[0].lastError, "message_not_persisted_yet");
  assert.ok(receipts[0].availableAt.getTime() > Date.now());
  assert.equal(updates.length, 0);
  messages.push({ id: "row-late", conversationId: "chat-a", messageId: "wa-id", status: "pending", fromMe: true });
  Object.assign(receipts[0], { attempts: 2, state: "processing", claimToken: "worker:late" });
  assert.equal(await processStatusReceipt({ receipt: { ...receipts[0] }, token: "worker:late" }), "completed");
  assert.equal(receipts[0].state, "completed");
  assert.equal(messages.at(-1).status, "delivered");
  assert.equal(updates.length, 1);
});

test("recibos antigos e repetidos completam sem regredir ou escrever novamente", async () => {
  messages[0].status = "read";
  for (const receiptStatus of ["delivered", "sent", "pending", "read", "error"]) {
    assert.equal(await processStatusReceipt(claim({ receiptStatus })), "completed");
  }
  assert.equal(messages[0].status, "read");
  assert.equal(updates.length, 0);
  assert.equal(globalThis.receiptBroadcasts.length, 0);
});

test("guarda atômica protege READ que chega entre lookup e UPDATE", async () => {
  beforeUpdate = () => { messages[0].status = "read"; };
  assert.equal(await processStatusReceipt(claim()), "completed");
  assert.equal(messages[0].status, "read");
  assert.equal(updates.length, 1);
  assert.equal(globalThis.receiptBroadcasts.length, 0);
});

test("echo com snapshot pending não regride ACK read concorrente ao usar a transação recebida", async () => {
  const echoSnapshot = { ...messages[0] };
  messages[0].status = "read";
  let transactionWrites = 0;
  const transaction = {
    whatsAppMessage: { updateMany: async (query) => {
      transactionWrites++;
      return globalThis.prisma.whatsAppMessage.updateMany(query);
    } },
  };
  const result = await applyObservedMessageStatus({
    id: echoSnapshot.id, conversationId: echoSnapshot.conversationId,
    messageId: echoSnapshot.messageId, instanceId: "instance-a", status: "sent",
  }, transaction);
  assert.equal(transactionWrites, 1);
  assert.equal(result.count, 0);
  assert.equal(messages[0].status, "read");
  assert.deepEqual(updates[0].data, { status: "sent" });
  assert.equal(updates[0].where.id, "row-a");
  assert.equal(updates[0].where.conversationId, "chat-a");
  assert.deepEqual(updates[0].where.conversation, { instanceId: "instance-a" });
  assert.equal(messages[1].status, "pending");
});

test("echo SBC usa helper atômico, relê conflito e separa status da atualização de metadados", async () => {
  const source = await readFile(new URL("../src/app/api/whatsapp/webhook/route.ts", import.meta.url), "utf8");
  const start = source.indexOf("async function persistIncomingMessageFast");
  const end = source.indexOf("async function hydratePersistedMedia", start);
  assert.ok(start > 0 && end > start);
  const ingest = source.slice(start, end);
  const pilotStart = ingest.indexOf("if (isStatusReceiptPilot(params.dbInstance))");
  const legacyStart = ingest.indexOf("} else {", pilotStart);
  const pilot = ingest.slice(pilotStart, legacyStart);
  assert.ok(pilotStart > 0 && legacyStart > pilotStart);
  assert.match(pilot, /await applyObservedMessageStatus\([\s\S]*?\}, tx\)/);
  assert.match(pilot, /else persisted = await tx\.whatsAppMessage\.findUniqueOrThrow/);
  assert.doesNotMatch(pilot, /dataToUpdate\.status\s*=/);
  assert.match(ingest.slice(legacyStart), /dataToUpdate\.status = nextStatus/);
  assert.match(ingest, /tx\.whatsAppMessage\.update\(\{[\s\S]*?data: dataToUpdate/);
});

test("erro não promove SERVER_ACK mas permite evidência posterior de entrega", async () => {
  messages[0].status = "error";
  await processStatusReceipt(claim({ receiptStatus: "sent" }));
  assert.equal(messages[0].status, "error");
  await processStatusReceipt(claim({ receiptStatus: "delivered" }));
  assert.equal(messages[0].status, "delivered");
  assert.equal(updates.length, 1);
});

test("mensagem inbound com o mesmo ID nunca recebe status de saída", async () => {
  messages[0].fromMe = false;
  assert.equal(await processStatusReceipt(claim()), "pending");
  assert.equal(messages[0].status, "pending");
  assert.equal(updates.length, 0);
});

test("falha de banco durante lookup ou update preserva recibo para recuperação", async () => {
  for (const stage of ["lookup", "message-update"]) {
    failure = stage;
    const pending = claim();
    assert.equal(await processStatusReceipt(pending), "pending");
    assert.equal(receipts.at(-1).state, "pending");
    assert.equal(receipts.at(-1).lastError, "receipt_apply_failed");
  }
  assert.equal(messages[0].status, "pending");
  assert.equal(globalThis.receiptBroadcasts.length, 0);
});

test("falha até ao reagendar não apaga lease durável recuperável", async () => {
  messages.shift(); failure = "receipt-storage";
  assert.equal(await processStatusReceipt(claim()), "pending");
  assert.equal(receipts[0].state, "processing");
  assert.equal(receipts[0].claimToken, "claim-1");
  assert.equal(globalThis.receiptBroadcasts.length, 0);
});

test("Broadcast indisponível não desfaz mensagem nem recibo completado", async () => {
  globalThis.receiptBroadcastResult = false;
  assert.equal(await processStatusReceipt(claim()), "completed");
  assert.equal(receipts[0].state, "completed");
  assert.equal(messages[0].status, "delivered");
  assert.equal(globalThis.receiptBroadcasts.length, 1);
});

test("recibo inválido termina ambíguo sem consulta de mensagem", async () => {
  assert.equal(await processStatusReceipt(claim({ remoteJid: "123@g.us" })), "ambiguous");
  assert.equal(await processStatusReceipt(claim({ receiptStatus: "future-unknown" })), "ambiguous");
  assert.equal(lookups.length, 0);
  assert.ok(receipts.every((receipt) => receipt.lastError === "invalid_receipt"));
});

test("piloto e normalização não ampliam escopo nem tratam grupo como contato", () => {
  assert.equal(isStatusReceiptPilot({ unit: "SBC", provider: "evolution" }), true);
  for (const unit of ["Osasco", "SCS", "Todas", null]) assert.equal(isStatusReceiptPilot({ unit, provider: "evolution" }), false);
  assert.equal(isStatusReceiptPilot({ unit: "SBC", provider: "waha" }), false);
  assert.equal(normalizeReceiptJid(`  ${phone}:2@S.WHATSAPP.NET `), `${phone}@s.whatsapp.net`);
  assert.equal(normalizeReceiptJid(`${phone}@c.us`), `${phone}@s.whatsapp.net`);
  assert.equal(normalizeReceiptJid("123@g.us"), null);
  assert.equal(normalizeReceiptJid("status@broadcast"), null);
});
