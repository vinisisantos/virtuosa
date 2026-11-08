import assert from "node:assert/strict";
import { test } from "node:test";
import { Prisma } from "@prisma/client";

let row = null;
const draftStore = {
  create: async ({ data }) => {
    if (row) throw new Prisma.PrismaClientKnownRequestError("duplicado", { code: "P2002", clientVersion: "test" });
    row = { ...data, id: "draft", version: 1, updatedAt: new Date("2026-11-08T12:00:00Z") };
    return { ...row };
  },
  updateMany: async ({ where, data }) => {
    if (!row || where.id !== row.id || where.version !== row.version || where.updatedAt.getTime() !== row.updatedAt.getTime()) return { count: 0 };
    row = { ...row, ...data, version: row.version + 1, updatedAt: new Date(row.updatedAt.getTime() + 1) };
    return { count: 1 };
  },
  findUniqueOrThrow: async () => ({ ...row }),
};
globalThis.prisma = { aiAssistantDraft: draftStore, $transaction: async (callback) => callback({ aiAssistantDraft: draftStore }) };
const { saveAliceDraft } = await import("#lib/ai-assistant/save-draft");

test("criações concorrentes não substituem a primeira sugestão concluída", async () => {
  row = null;
  const first = { current: null, create: { conversationId: "c", content: "nova" }, update: {} };
  await saveAliceDraft(first);
  await assert.rejects(saveAliceDraft({ ...first, create: { conversationId: "c", content: "antiga" } }), /Outra sugestão/);
  assert.equal(row.content, "nova");
});

test("geração atrasada não substitui versão já salva ou selecionada", async () => {
  row = { id: "draft", conversationId: "c", content: "original", version: 1, updatedAt: new Date("2026-11-08T12:00:00Z") };
  const snapshot = { id: row.id, version: row.version, updatedAt: row.updatedAt };
  const create = { conversationId: "c", content: "não usado" };
  await saveAliceDraft({ current: snapshot, create, update: { content: "nova" } });
  await assert.rejects(saveAliceDraft({ current: snapshot, create, update: { content: "antiga" } }), /Outra sugestão/);
  assert.equal(row.content, "nova");
});
