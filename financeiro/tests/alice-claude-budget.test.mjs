import assert from "node:assert/strict";
import { test } from "node:test";

const settings = new Map();
const tx = {
  $executeRaw: async () => 1,
  appSetting: {
    findUnique: async ({ where }) => settings.has(where.key) ? { value: settings.get(where.key) } : null,
    upsert: async ({ where, create, update }) => settings.set(where.key, settings.has(where.key) ? update.value : create.value),
  },
};
globalThis.prisma = { $transaction: async (callback) => callback(tx) };
const { reserveClaudeMonthlyBudget, claudeMonthlyReservation } = await import("#lib/ai-assistant/claude-budget");

test("reserva mensal limita chamadas e isola meses sem consultar o banco real", async () => {
  const input = { CONVERSA: [{ text: "x".repeat(50_000) }] };
  const date = new Date("2026-10-15T15:00:00Z");
  const reservation = claudeMonthlyReservation(input);
  const max = Math.floor(5_000_000 / reservation);
  for (let i = 0; i < max; i++) await reserveClaudeMonthlyBudget(input, date);
  await assert.rejects(reserveClaudeMonthlyBudget(input, date), /Limite mensal/);
  await reserveClaudeMonthlyBudget(input, new Date("2026-11-15T15:00:00Z"));
  assert.equal(settings.size, 2);
});

test("orçamento inválido falha fechado", async () => {
  settings.clear();
  settings.set("ai_assistant_claude_budget:2026-11", "inválido");
  await assert.rejects(reserveClaudeMonthlyBudget({}, new Date("2026-11-15T15:00:00Z")), /verificar o limite/);
});
