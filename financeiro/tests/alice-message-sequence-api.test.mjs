import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
import { registerHooks } from "node:module";
import { NextRequest } from "next/server.js";

const state = globalThis.aliceSequenceApi = {};
const replacements = {
  "next/server": `export { NextRequest, NextResponse } from ${JSON.stringify(import.meta.resolve("next/server.js"))};`,
  "@/lib/db": "export const prisma = globalThis.aliceSequenceApi.db;",
  "@/lib/auth": "export const getUserFromHeaders = () => ({ userId: 'operator' });",
  "@/lib/ai-assistant/access": "export function requireAliceAuthorizedUser() {}",
  "@/lib/ai-assistant/context": "export async function loadAccessibleAliceConversation() { return { unit: 'SBC', conversation: { aiMode: 'suggestions', contact: { name: null } } }; }",
  "@/lib/ai-assistant/generate": "export async function generateConversationSuggestion() { throw new Error('not expected'); }",
  "@/lib/ai-assistant/runtime": "export function requireAliceLiveRuntime() {}",
};
registerHooks({ resolve(specifier, context, next) {
  if (replacements[specifier]) return { url: `data:text/javascript,${encodeURIComponent(replacements[specifier])}`, shortCircuit: true };
  return next(specifier, context);
} });

const tx = {
  $queryRaw: async () => [{ id: "conversation" }],
  whatsAppMessage: { findFirst: async () => state.latestAny || state.latest },
  aiAssistantDraft: { updateMany: async ({ where, data }) => {
    if (state.draft.id !== where.id || state.draft.version !== where.version || !where.status.in.includes(state.draft.status)) return { count: 0 };
    state.draft = { ...state.draft, ...data, version: data.version?.increment ? state.draft.version + data.version.increment : state.draft.version };
    return { count: 1 };
  } },
  aiAssistantOperation: { updateMany: async () => ({ count: 1 }) },
};
state.db = {
  aiAssistantDraft: { findUnique: async () => state.draft, findFirst: async () => state.draft },
  whatsAppMessage: { findFirst: async (query) => query.where.type ? state.latest : (state.latestAny || state.latest) },
  $transaction: async (fn) => fn(tx),
};
const route = await import("../src/app/api/crm/ai-assistant/suggestions/route.ts");
const req = (method, body) => new NextRequest("https://example.test/api/crm/ai-assistant/suggestions?conversationId=conversation", { method, ...(body ? { body: JSON.stringify(body) } : {}) });

beforeEach(() => {
  state.latest = { id: "incoming", fromMe: false };
  state.latestAny = null;
  state.draft = { id: "draft", unit: "SBC", model: "gpt-6-luna", sourceMessageId: "incoming", sentMessageId: null, content: "Olá!", status: "active", version: 1, createdAt: new Date(), updatedAt: new Date(), usage: { sequenceAllowed: true, comparison: { claude: { response: "Olá!", messages: ["Olá!", "É sua primeira vez?"] } } } };
});

test("duas mensagens são inseridas separadamente e a segunda só fica disponível após o primeiro envio", async () => {
  const first = await route.PATCH(req("PATCH", { conversationId: "conversation", action: "use", draftId: "draft", draftVersion: 1, provider: "claude" }));
  assert.equal(first.status, 200);
  assert.equal((await first.json()).content, "Olá!");
  assert.equal(state.draft.usage.sequence.index, 0);
  state.draft.status = "sent"; state.draft.sentMessageId = "outgoing"; state.latest = { id: "outgoing", fromMe: true };
  const get = await route.GET(req("GET"));
  assert.equal((await get.json()).draft.status, "sent");
  const second = await route.PATCH(req("PATCH", { conversationId: "conversation", action: "use", draftId: "draft", draftVersion: 2, provider: "claude" }));
  assert.equal(second.status, 200);
  assert.equal((await second.json()).content, "É sua primeira vez?");
  assert.equal(state.draft.usage.sequence.index, 1);
});

test("uma resposta nova da cliente invalida a segunda mensagem antiga", async () => {
  await route.PATCH(req("PATCH", { conversationId: "conversation", action: "use", draftId: "draft", draftVersion: 1, provider: "claude" }));
  state.draft.status = "sent"; state.draft.sentMessageId = "outgoing"; state.latest = { id: "new-incoming", fromMe: false };
  assert.equal((await route.GET(req("GET"))).status, 200);
  assert.equal((await route.PATCH(req("PATCH", { conversationId: "conversation", action: "use", draftId: "draft", draftVersion: 2, provider: "claude" }))).status, 409);
});

test("áudio novo invalida a sequência mesmo que a última mensagem de texto continue igual", async () => {
  await route.PATCH(req("PATCH", { conversationId: "conversation", action: "use", draftId: "draft", draftVersion: 1, provider: "claude" }));
  state.draft.status = "sent"; state.draft.sentMessageId = "outgoing"; state.latest = { id: "outgoing", fromMe: true };
  state.latestAny = { id: "audio-new", fromMe: false };
  assert.equal((await (await route.GET(req("GET"))).json()).draft, null);
  assert.equal((await route.PATCH(req("PATCH", { conversationId: "conversation", action: "use", draftId: "draft", draftVersion: 2, provider: "claude" }))).status, 409);
});
