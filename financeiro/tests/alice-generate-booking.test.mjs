import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { AiAssistantError } from "#lib/ai-assistant/policy";
import { normalizeAiAssistantMessageLayout } from "#lib/ai-assistant/provider";
import { isSbcOpeningSequenceContext } from "#lib/ai-assistant/message-sequence";

function fixture({ bookingStatus = "booked", failSave = false, flowPrompt = null, compare = false } = {}) {
  const state = { contexts: 0, saved: null, bookingCalls: 0 };
  const context = (latest) => ({
    conversation: { id: "conversation", aiMode: "suggestions", instanceId: "instance", instance: { unit: "SBC" }, contact: { phone: "5511999999999", unit: "SBC" } },
    unit: "SBC", latestMessageId: latest, targetMessageId: null, recentMessages: [], sourceFingerprint: `fingerprint-${latest}`,
    contactName: null, handoffReason: null, config: { dailyBudgetMicroUsd: 1000000 }, prompt: flowPrompt || { UNIDADE: "SBC", BASE_ALICE: { documents: [] }, CONVERSA: [] },
  });
  const result = { response: "Resposta provisória", messages: ["Resposta provisória"], confidence: "high", needsHuman: false, usedKnowledge: [] };
  const prisma = {
    aiAssistantDraft: { findUnique: async () => null },
    whatsAppMessage: { findFirst: async () => ({ id: "incoming", fromMe: false }) },
    aiAssistantOperation: { updateMany: async () => ({ count: 1 }) },
  };
  const modules = {
    "@prisma/client": { Prisma: {} },
    "@/lib/db": { prisma },
    "@/lib/ai-assistant/budget": { reserveAiAssistantOperation: async () => ({ id: "operation" }), failAiAssistantOperation: async () => {}, finishAiAssistantOperation: async () => {} },
    "@/lib/ai-assistant/context": { loadAliceSuggestionContext: async () => context(++state.contexts === 1 ? "incoming" : "confirmation") },
    "@/lib/ai-assistant/alice-knowledge": { buildAliceKnowledgeContext: () => ({}) },
    "@/lib/ai-assistant/handoff": { routeAliceHandoff: async () => null },
    "@/lib/ai-assistant/runtime": { requireAliceLiveRuntime: () => {} },
    "@/lib/ai-assistant/safety": { aliceLocalHandoffReply: () => "Equipe", classifyAliceHandoff: () => null },
    "@/lib/ai-assistant/provider": { generateAiAssistantReply: async () => result, normalizeAiAssistantMessageLayout },
    "@/lib/ai-assistant/claude-provider": { generateClaudeReply: async () => result },
    "@/lib/ai-assistant/claude-budget": { reserveClaudeMonthlyBudget: async () => {} },
    "@/lib/ai-assistant/save-draft": { saveAliceDraft: async (input) => { if (failSave) throw new Error("synthetic save failure"); state.saved = input; return { id: "draft", version: 1, ...input.create }; } },
    "@/lib/ai-assistant/privacy": { personalizeAiAssistantResponse: (value) => value },
    "@/lib/ai-assistant/message-sequence": { isSbcOpeningSequenceContext },
    "@/lib/ai-assistant/auto-schedule": {
      looksLikeSchedulingExchange: () => true,
      tryAliceAutoSchedule: async () => { state.bookingCalls++; return bookingStatus === "booked" ? { status: "booked", confirmation: "submitted", startTime: "2026-11-09T13:00:00Z" } : bookingStatus === "not_applicable" ? { status: "not_applicable" } : { status: "review", reason: "Verifique os dados." }; },
    },
    "@/lib/ai-assistant/sbc-scheduling-policy": { isSchedulingSuggestionExpired: () => false, schedulingSuggestionExpiry: () => null },
    "@/lib/ai-assistant/policy": { AI_ASSISTANT_MODEL: "gpt-6-luna", AI_ASSISTANT_RESERVED_MICRO_USD: 0, AiAssistantError },
  };
  const source = readFileSync(new URL("../src/lib/ai-assistant/generate.ts", import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, console, process, require: (id) => { assert.ok(modules[id], `dependência não simulada: ${id}`); return modules[id]; } });
  return { run: () => exports.generateConversationSuggestion({ req: {}, conversationId: "conversation", userId: "user", compare }), state };
}

test("após agendar, o rascunho aponta para a mensagem de confirmação e registra o resultado real", async () => {
  const f = fixture();
  const result = await f.run();
  assert.equal(f.state.bookingCalls, 1);
  assert.equal(result.draft.sourceMessageId, "confirmation");
  assert.equal(result.draft.usage.booking.status, "booked");
  assert.doesNotMatch(result.draft.content, /Resposta provisória/);
});

test("fluxo real de geração aplica apresentação e volume a ambos os provedores antes de salvar", async () => {
  const previous = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = "synthetic-test-only";
  try {
    const f = fixture({ bookingStatus: "not_applicable", compare: true, flowPrompt: {
      UNIDADE: "SBC", CAMPANHA: "Glúteos Perfeitos", BASE_ALICE: { documents: [] },
      CONVERSA: [{ role: "atendente", text: "Olá, recebemos seu contato!" }, { role: "cliente", text: "Volume e flacidez" }],
    } });
    const { draft } = await f.run();
    assert.equal(draft.usage.sequenceAllowed, true);
    for (const result of [draft.usage.comparison.codex, draft.usage.comparison.claude]) {
      assert.match(result.messages[0], /Alice.*Virtuosa/);
      assert.match(result.messages[1], /volume médio ou grande/);
      assert.doesNotMatch(result.messages.join(" "), /Resposta provisória|agend|semana|sábado/);
    }
  } finally {
    if (previous === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = previous;
  }
});

test("ambiguidade gera aviso para a equipe e texto que não promete agendamento", async () => {
  const f = fixture({ bookingStatus: "review" });
  const result = await f.run();
  assert.equal(result.draft.usage.booking.status, "review");
  assert.match(result.draft.content, /verificar/i);
  assert.doesNotMatch(result.draft.content, /agendada/i);
});

test("se o rascunho falhar depois da reserva, o erro informa que a avaliação foi salva", async () => {
  const f = fixture({ failSave: true });
  await assert.rejects(f.run(), /avaliação foi salva/i);
});
