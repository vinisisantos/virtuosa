import assert from "node:assert/strict";
import test, { beforeEach, afterEach, mock } from "node:test";
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";

globalThis.receiptNextResponse = (await import("next/server.js")).NextResponse;
registerHooks({ resolve(specifier, context, next) {
  const stubs = {
    "next/server": "export const NextResponse = globalThis.receiptNextResponse; export function after(task) { globalThis.receiptAfterTasks.push(task); }",
    "@/lib/whatsapp-call-block-sync": "export async function ensureCallRejectApplied(instance) { globalThis.receiptCallSync.push(instance.name); }",
    "@/lib/whatsapp/inbox-realtime": "export async function broadcastInboxRealtimeChange(change) { globalThis.receiptBroadcasts.push(change); return true; }",
    "@/lib/whatsapp/automation-sender": "export async function sendAutomationText() { globalThis.receiptForbidden.push('sendAutomationText'); throw new Error('Automação proibida no teste de ACK'); }",
    "@/lib/whatsapp/campaign-welcome": "export async function enqueueWelcome() { globalThis.receiptForbidden.push('enqueueWelcome'); throw new Error('Recepção proibida no teste de ACK'); } export async function findWelcomeReception() { globalThis.receiptForbidden.push('findWelcomeReception'); throw new Error('Recepção proibida no teste de ACK'); }",
  };
  if (stubs[specifier]) return { url: "data:text/javascript," + encodeURIComponent(stubs[specifier]), shortCircuit: true };
  if (specifier.startsWith(".") && context.parentURL && existsSync(new URL(`${specifier}.ts`, context.parentURL))) {
    return next(new URL(`${specifier}.ts`, context.parentURL).href, context);
  }
  return next(specifier, context);
} });

const phone = "5511999990000";
let rows, storedReceipts, operations, retainGate, retainFailure, lookupFailure, instanceFailure, logs;
let inboundJobs, workerClaimOrder, workerCost;
const previousFetch = globalThis.fetch;
const previousCronSecret = process.env.CRON_SECRET;
globalThis.receiptAfterTasks = [];
globalThis.receiptCallSync = [];
globalThis.receiptBroadcasts = [];
globalThis.receiptForbidden = [];

function matches(row, where) {
  if (where.id && row.id !== where.id) return false;
  if (where.messageId && row.messageId !== where.messageId) return false;
  if (where.conversationId && row.conversationId !== where.conversationId) return false;
  if (where.fromMe !== undefined && row.fromMe !== where.fromMe) return false;
  if (where.conversation?.instanceId && row.instanceId !== where.conversation.instanceId) return false;
  if (where.conversation?.contact?.phone?.in && !where.conversation.contact.phone.in.includes(phone)) return false;
  return !where.status?.notIn?.some((status) => status.toLowerCase() === row.status.toLowerCase());
}

globalThis.prisma = {
  $transaction: async (queries) => Promise.all(queries),
  $queryRaw: async (query) => {
    const sql = query.sql;
    if (sql.includes('"WhatsAppStatusReceipt"') && sql.includes("WITH stale AS")) {
      operations.push({ kind: "recover-receipts" });
      return [];
    }
    if (sql.includes('"WhatsAppStatusReceipt"')) {
      operations.push({ kind: "claim-receipt" });
      const row = storedReceipts.find((receipt) => receipt.state === "pending" && receipt.attempts < 6);
      if (!row) return [];
      const token = query.values.find((value) => typeof value === "string" && value.startsWith("worker:"));
      assert.ok(token);
      Object.assign(row, { state: "processing", attempts: row.attempts + 1, claimToken: token, claimedAt: new Date() });
      workerClaimOrder.push("receipt");
      return [{ ...row }];
    }
    if (sql.includes('"WhatsAppInboundPostProcessJob"')) {
      operations.push({ kind: "claim-inbound" });
      const row = inboundJobs.find((job) => job.status === "pending" && job.attempts < 4);
      if (!row) return [];
      const token = query.values.find((value) => typeof value === "string");
      assert.ok(token);
      Object.assign(row, { status: "processing", attempts: row.attempts + 1, claimToken: token, claimedAt: new Date() });
      workerClaimOrder.push("inbound");
      return [{ ...row }];
    }
    throw new Error("SQL não esperado no teste offline do worker");
  },
  whatsAppInboundPostProcessJob: {
    updateMany: async ({ where, data }) => {
      if (!where.id) { operations.push({ kind: "recover-inbound" }); return { count: 0 }; }
      const row = inboundJobs.find((job) => job.id === where.id && job.claimToken === where.claimToken && job.status === where.status);
      if (!row) return { count: 0 };
      Object.assign(row, data);
      operations.push({ kind: "complete-inbound", id: row.id });
      return { count: 1 };
    },
  },
  whatsAppInstance: {
    findFirst: async (query) => {
      operations.push({ kind: "instance", query });
      if (instanceFailure) throw new Error("synthetic instance read failure");
      const name = query.where.name;
      if (name === "missing") return null;
      return { id: `instance-${name}`, name, unit: name === "waha" ? "SBC" : name, provider: name === "waha" ? "waha" : "evolution" };
    },
    findUnique: async () => { if (workerCost) workerCost(); return null; },
  },
  whatsAppStatusReceipt: {
    createManyAndReturn: async ({ data, skipDuplicates }) => {
      operations.push({ kind: "retain", data, skipDuplicates });
      if (retainGate) await retainGate;
      if (retainFailure) throw new Error("synthetic receipt storage failure");
      const created = [];
      for (const row of data) {
        if (storedReceipts.some((receipt) => ["instanceId", "messageId", "remoteJid", "receiptStatus"].every((key) => receipt[key] === row[key]))) continue;
        storedReceipts.push({ ...row }); created.push({ ...row });
      }
      return created;
    },
    updateMany: async ({ where, data }) => {
      operations.push({ kind: "receipt-update", where, data });
      const targets = where.OR || [{ id: where.id, claimToken: where.claimToken }];
      let count = 0;
      for (const row of storedReceipts) {
        if (row.state === where.state && targets.some((target) => row.id === target.id && row.claimToken === target.claimToken)) {
          Object.assign(row, data); count++;
        }
      }
      return { count };
    },
  },
  whatsAppContact: { findUnique: async () => ({ id: "contact" }) },
  whatsAppConversation: {
    findUnique: async ({ where }) => ({ id: `chat-${where.contactId_instanceId.instanceId.slice("instance-".length)}` }),
  },
  whatsAppMessage: {
    findMany: async ({ where, take }) => {
      operations.push({ kind: "message-lookup", where });
      if (lookupFailure) throw new Error("synthetic message lookup failure");
      if (workerCost) workerCost();
      return rows.filter((row) => matches(row, where)).slice(0, take).map((row) => ({ ...row }));
    },
    findUnique: async ({ where }) => {
      const key = where.conversationId_messageId;
      return rows.find((row) => row.conversationId === key.conversationId && row.messageId === key.messageId) || null;
    },
    updateMany: async ({ where, data }) => {
      operations.push({ kind: "message-update", where, data });
      let count = 0;
      for (const row of rows) if (matches(row, where)) { Object.assign(row, data); count++; }
      return { count };
    },
  },
  webhookLog: { create: async ({ data }) => { logs.push(data); return data; } },
};

const { POST } = await import("../src/app/api/whatsapp/webhook/route.ts");
const update = (overrides = {}) => ({ keyId: "wa-id", remoteJid: `${phone}@s.whatsapp.net`, status: "DELIVERY_ACK", fromMe: true, ...overrides });
const send = (data = update(), name = "SBC", event = "messages.update") => POST(new Request("http://localhost/api/whatsapp/webhook", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ event, instance: name, data }),
}));
const flushAfter = async () => { while (globalThis.receiptAfterTasks.length) await globalThis.receiptAfterTasks.shift()(); };
const worker = (authorization = "Bearer synthetic-worker-secret") => POST(new Request("http://localhost/api/whatsapp/webhook", {
  method: "POST", headers: { "Content-Type": "application/json", Authorization: authorization },
  body: JSON.stringify({ event: "internal.whatsapp-postprocess" }),
}));
const seedWorker = (receiptCount, inboundCount) => {
  for (let index = 0; index < receiptCount; index++) {
    const messageId = `worker-wa-${index}`;
    storedReceipts.push({
      id: `worker-receipt-${index}`, instanceId: "instance-SBC", messageId,
      remoteJid: `${phone}@s.whatsapp.net`, receiptStatus: "delivered", state: "pending",
      attempts: 0, receivedAt: new Date(), availableAt: new Date(), claimToken: null,
    });
    rows.push({ id: `worker-row-${index}`, messageId, instanceId: "instance-SBC", conversationId: "chat-SBC", fromMe: true, status: "pending" });
  }
  for (let index = 0; index < inboundCount; index++) {
    inboundJobs.push({
      id: `inbound-job-${index}`, instanceId: "removed-instance", status: "pending", attempts: 0,
      payload: { message: {}, webhook: {} }, createdAt: new Date(), availableAt: new Date(),
    });
  }
};

beforeEach(() => {
  rows = ["SBC", "Osasco", "SCS", "Todas"].map((unit) => ({
    id: `row-${unit}`, conversationId: `chat-${unit}`, instanceId: `instance-${unit}`, messageId: "wa-id", fromMe: true, status: "pending",
  }));
  storedReceipts = []; operations = []; retainGate = null; retainFailure = false; lookupFailure = false; instanceFailure = false; logs = [];
  inboundJobs = []; workerClaimOrder = []; workerCost = null;
  process.env.CRON_SECRET = "synthetic-worker-secret";
  globalThis.receiptAfterTasks = []; globalThis.receiptCallSync = []; globalThis.receiptBroadcasts = []; globalThis.receiptForbidden = [];
  globalThis.fetch = async () => { globalThis.receiptForbidden.push("fetch"); throw new Error("Sem envio ou consulta externa no teste de recibos"); };
  mock.method(console, "info", () => {}); mock.method(console, "warn", () => {}); mock.method(console, "error", () => {});
});
afterEach(() => {
  assert.deepEqual(globalThis.receiptForbidden, []);
  globalThis.fetch = previousFetch;
  if (previousCronSecret === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = previousCronSecret;
  mock.restoreAll();
});

test("SBC só responde 200 após retenção durável; aplicação é agendada por Next after", async () => {
  let release;
  retainGate = new Promise((resolve) => { release = resolve; });
  let responded = false;
  const pending = send().then((response) => { responded = true; return response; });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(responded, false);
  assert.equal(storedReceipts.length, 0);
  assert.equal(globalThis.receiptAfterTasks.length, 0);
  release();
  const response = await pending;
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { success: true });
  assert.equal(storedReceipts.length, 1);
  assert.equal(storedReceipts[0].state, "processing");
  assert.equal(storedReceipts[0].receiptStatus, "delivered");
  assert.equal(globalThis.receiptAfterTasks.length, 1);
  assert.equal(rows[0].status, "pending");
  assert.equal(globalThis.receiptCallSync.length, 0);
  await flushAfter();
  assert.equal(rows[0].status, "delivered");
  assert.ok(rows.slice(1).every((row) => row.status === "pending"));
  assert.equal(storedReceipts[0].state, "completed");
  assert.deepEqual(globalThis.receiptCallSync, ["SBC"]);
  assert.equal(globalThis.receiptBroadcasts.length, 1);
  assert.equal(logs.length, 0);
  assert.deepEqual(operations[0].query.select, { id: true, name: true, unit: true, provider: true });
  assert.deepEqual(operations.map((operation) => operation.kind), [
    "instance", "retain", "message-lookup", "message-update", "receipt-update",
  ]);
});

test("erro na retenção de SBC retorna 503 e não agenda processamento ou envio", async () => {
  retainFailure = true;
  const response = await send();
  assert.equal(response.status, 503);
  assert.equal((await response.json()).success, false);
  assert.equal(storedReceipts.length, 0);
  assert.equal(globalThis.receiptAfterTasks.length, 0);
  assert.equal(globalThis.receiptCallSync.length, 0);
  assert.ok(rows.every((row) => row.status === "pending"));
});

test("erro depois da retenção mantém 200 legítimo e recibo reagendado", async () => {
  lookupFailure = true;
  const response = await send();
  assert.equal(response.status, 200);
  await flushAfter();
  assert.equal(storedReceipts[0].state, "pending");
  assert.equal(storedReceipts[0].lastError, "receipt_apply_failed");
  assert.ok(storedReceipts[0].availableAt.getTime() > Date.now());
  assert.equal(rows[0].status, "pending");
});

test("ACK sem mensagem sobrevive ao after para recuperação posterior", async () => {
  rows.shift();
  assert.equal((await send()).status, 200);
  await flushAfter();
  assert.equal(storedReceipts[0].state, "pending");
  assert.equal(storedReceipts[0].lastError, "message_not_persisted_yet");
  assert.equal(globalThis.receiptBroadcasts.length, 0);
});

test("replay do mesmo recibo não reinicia claim, não duplica registro nem promoção", async () => {
  assert.equal((await send()).status, 200);
  await flushAfter();
  const completedAt = storedReceipts[0].completedAt;
  assert.equal((await send()).status, 200);
  await flushAfter();
  assert.equal(storedReceipts.length, 1);
  assert.equal(storedReceipts[0].attempts, 1);
  assert.equal(storedReceipts[0].completedAt, completedAt);
  assert.equal(globalThis.receiptBroadcasts.length, 1);
});

test("lote normaliza formato nested e conserva ordem monotônica sem reter texto", async () => {
  const response = await send([
    { key: { id: "wa-id", remoteJid: `${phone}:2@s.whatsapp.net`, fromMe: true }, update: { status: 4 }, message: { conversation: "NÃO PERSISTIR CONTEÚDO" } },
    update({ status: "SERVER_ACK" }),
  ], "SBC", " MESSAGES_UPDATE ");
  assert.equal(response.status, 200);
  assert.equal(storedReceipts.length, 2);
  assert.ok(storedReceipts.every((receipt) => receipt.remoteJid === `${phone}@s.whatsapp.net`));
  assert.equal(JSON.stringify(storedReceipts).includes("NÃO PERSISTIR CONTEÚDO"), false);
  await flushAfter();
  assert.equal(rows[0].status, "read");
  assert.equal(globalThis.receiptBroadcasts.length, 1);
});

test("grupo, broadcast, inbound e status desconhecido não entram na fila de saída", async () => {
  const response = await send([
    update({ remoteJid: "123456@g.us" }), update({ remoteJid: "status@broadcast" }),
    update({ fromMe: false }), update({ status: "FUTURE_STATUS" }), update({ keyId: "x".repeat(161) }),
  ]);
  assert.equal(response.status, 200);
  assert.equal(storedReceipts.length, 0);
  assert.equal(operations.filter((operation) => operation.kind === "retain").length, 0);
  await flushAfter();
  assert.ok(rows.every((row) => row.status === "pending"));
});

test("lote acima de 200 é rejeitado antes de gravar ou agendar qualquer confirmação", async () => {
  const response = await send(Array.from({ length: 201 }, (_, index) => update({ keyId: `wa-${index}` })));
  assert.equal(response.status, 413);
  assert.equal(storedReceipts.length, 0);
  assert.equal(globalThis.receiptAfterTasks.length, 0);
});

test("Osasco, SCS e Todas mantêm caminho legacy sem nova fila ou Next after", async () => {
  for (const unit of ["Osasco", "SCS", "Todas"]) {
    assert.equal((await send(update(), unit)).status, 200);
    assert.equal(rows.find((row) => row.instanceId === `instance-${unit}`).status, "delivered");
  }
  assert.equal(storedReceipts.length, 0);
  assert.equal(globalThis.receiptAfterTasks.length, 0);
  assert.deepEqual(globalThis.receiptCallSync, ["Osasco", "SCS", "Todas"]);
  assert.equal(rows[0].status, "pending");
});

test("WAHA e instância ausente nunca usam retenção do piloto Evolution", async () => {
  assert.equal((await send(update(), "waha")).status, 200);
  assert.equal((await send(update(), "missing")).status, 200);
  assert.equal(storedReceipts.length, 0);
  assert.equal(globalThis.receiptAfterTasks.length, 0);
  assert.equal(globalThis.receiptCallSync.length, 0);
});

test("falha de lookup da instância em evento de status não é confirmada como sucesso", async () => {
  instanceFailure = true;
  const response = await send();
  assert.equal(response.status, 503);
  assert.equal(storedReceipts.length, 0);
  assert.equal(globalThis.receiptAfterTasks.length, 0);
});

test("orçamento gasto antes da retenção adia lote inteiro numa operação sem aplicar ACK", async () => {
  let now = Date.now();
  mock.method(Date, "now", () => now);
  let release;
  retainGate = new Promise((resolve) => { release = resolve; });
  const pending = send(Array.from({ length: 12 }, (_, index) => update({ keyId: `budget-${index}` })));
  await new Promise((resolve) => setImmediate(resolve));
  now += 45_000;
  release();
  assert.equal((await pending).status, 200);
  assert.equal(storedReceipts.length, 12);
  await flushAfter();
  assert.deepEqual(operations.map((operation) => operation.kind), ["instance", "retain", "receipt-update"]);
  assert.equal(operations.at(-1).where.OR.length, 12);
  assert.ok(storedReceipts.every((receipt) => receipt.state === "pending" && receipt.lastError === "inline_budget_exhausted" && receipt.claimToken === null));
  assert.ok(rows.every((row) => row.status === "pending"));
  assert.equal(globalThis.receiptBroadcasts.length, 0);
});

test("worker alterna duas filas e limita a soma em vinte itens, não vinte por fila", async () => {
  seedWorker(25, 25);
  const response = await worker();
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.receiptsProcessed, 10);
  assert.equal(result.completed, 10);
  assert.equal(result.failed, 0);
  assert.deepEqual(workerClaimOrder, Array.from({ length: 20 }, (_, index) => index % 2 === 0 ? "receipt" : "inbound"));
  assert.equal(storedReceipts.filter((receipt) => receipt.state === "completed").length, 10);
  assert.equal(inboundJobs.filter((job) => job.status === "completed").length, 10);
  assert.equal(operations.filter((operation) => operation.kind === "recover-receipts").length, 1);
  assert.equal(operations.filter((operation) => operation.kind === "recover-inbound").length, 2);
  assert.equal(globalThis.receiptAfterTasks.length, 0);
});

test("worker aproveita fila única sem consultar repetidamente a fila vazia", async () => {
  seedWorker(25, 0);
  const result = await (await worker()).json();
  assert.equal(result.receiptsProcessed, 20);
  assert.equal(result.completed, 0);
  assert.equal(workerClaimOrder.length, 20);
  assert.equal(operations.filter((operation) => operation.kind === "claim-inbound").length, 1);
});

test("worker continua inbound quando a fila de recibos está vazia", async () => {
  seedWorker(0, 25);
  const result = await (await worker()).json();
  assert.equal(result.receiptsProcessed, 0);
  assert.equal(result.completed, 20);
  assert.equal(workerClaimOrder.length, 20);
  assert.equal(operations.filter((operation) => operation.kind === "claim-receipt").length, 1);
});

test("worker para no orçamento compartilhado de quarenta e cinco segundos", async () => {
  let now = Date.now();
  mock.method(Date, "now", () => now);
  workerCost = () => { now += 15_000; };
  seedWorker(25, 25);
  const result = await (await worker()).json();
  assert.equal(result.receiptsProcessed, 2);
  assert.equal(result.completed, 1);
  assert.equal(result.elapsedMs, 45_000);
  assert.deepEqual(workerClaimOrder, ["receipt", "inbound", "receipt"]);
});

test("worker não toca filas sem segredo interno válido", async () => {
  seedWorker(1, 1);
  assert.equal((await worker("Bearer wrong-secret")).status, 401);
  assert.deepEqual(operations, []);
  assert.deepEqual(workerClaimOrder, []);
  assert.equal(globalThis.receiptAfterTasks.length, 0);
});
