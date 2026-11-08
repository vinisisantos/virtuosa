import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { AiAssistantError, aiAssistantDigest } from "#lib/ai-assistant/policy";
import { classifyAliceHandoff } from "#lib/ai-assistant/safety";

// Carrega o módulo real com dependências isoladas: sem banco, rede ou dados da clínica.
function fixture(unit, messages, target = null) {
  const knowledgeRequests = [];
  const conversation = { id: "conversa-ficticia", instanceId: "i", aiMode: "suggestions", status: "open", contact: { name: null, unit }, instance: { id: "i", unit } };
  const prisma = { whatsAppConversation: { findFirst: async () => conversation }, whatsAppMessage: { findMany: async () => [...messages].reverse(), findFirst: async () => target } };
  const modules = {
    "@/lib/db": { prisma },
    "@/lib/whatsapp/instance-resolver": { getInstancesForRequest: async () => ({ instances: [{ id: "i", canReply: true }] }) },
    "@/lib/whatsapp/conversation-unit": { resolveInboxConversationUnit: () => unit },
    "@/lib/ai-assistant/scope": { isAliceUnit: () => true },
    "@/lib/ai-assistant/policy": { AiAssistantError, aiAssistantDigest },
    "@/lib/ai-assistant/config": { loadAiAssistantConfig: async () => ({ enabled: true }) },
    "@/lib/ai-assistant/alice-knowledge": { buildAliceKnowledgeContext: (input) => { knowledgeRequests.push(input); return { documents: [] }; } },
    "@/lib/ai-assistant/runtime": { requireAliceLiveRuntime: () => {} },
    "@/lib/ai-assistant/safety": { classifyAliceHandoff },
    "@/lib/ai-assistant/privacy": { resolveAiAssistantContactName: () => null, sanitizeAiAssistantText: (value) => value },
  };
  const source = readFileSync(new URL("../src/lib/ai-assistant/context.ts", import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, URL, require: (id) => { assert.ok(modules[id], `dependência não simulada: ${id}`); return modules[id]; } });
  return { load: (targetMessageId = null) => exports.loadAliceSuggestionContext({ req: new Request(`https://example.test/?unit=${unit}`), conversationId: "conversa-ficticia", userId: "usuario-ficticio", targetMessageId }), knowledgeRequests };
}

const message = (id, body, fromMe) => ({ id, body, fromMe, timestamp: new Date("2026-11-08T12:00:00Z"), respondedByName: fromMe ? "Equipe" : null });

test("SBC: saudação posterior não bloqueia e preserva pergunta para a análise", async () => {
  const f = fixture("SBC", [message("client", "Quero saber sobre Lipo Laser", false), message("greeting", "Olá, recebemos seu contato!", true)]);
  const context = await f.load();
  assert.equal(context.latestMessageId, "greeting");
  assert.equal(context.prompt.ULTIMA_MENSAGEM_CLIENTE.text, "Quero saber sobre Lipo Laser");
  assert.equal(context.prompt.MENSAGENS_RECENTES_SEM_RESPOSTA.length, 0);
  assert.match(f.knowledgeRequests[0].messageText, /Lipo Laser/);
});

test("SBC: resposta humana é incluída para avaliar se a pergunta já foi atendida", async () => {
  const f = fixture("SBC", [message("client", "Quanto custa?", false), message("team", "A avaliação é gratuita.", true)]);
  const context = await f.load();
  assert.equal(context.prompt.CONVERSA.length, 2);
  assert.equal(context.prompt.CONVERSA[1].text, "A avaliação é gratuita.");
  assert.equal(context.prompt.ULTIMA_MENSAGEM_CLIENTE.text, "Quanto custa?");
});

test("SBC: segurança clínica verifica a última entrada mesmo depois de saudação", async () => {
  const f = fixture("SBC", [message("client", "Tenho alergia, posso fazer?", false), message("team", "Olá, bem-vinda!", true)]);
  const context = await f.load();
  assert.equal(context.handoffReason, "clinical_safety");
  assert.equal(context.prompt, null);
  assert.equal(f.knowledgeRequests.length, 0);
});

test("SBC: selecionar uma mensagem anterior não ignora risco na última entrada", async () => {
  const old = message("old", "Quero informações", false);
  const f = fixture("SBC", [old, message("client", "Tenho alergia, posso fazer?", false), message("team", "Olá!", true)], old);
  const context = await f.load("old");
  assert.equal(context.handoffReason, "clinical_safety");
  assert.equal(f.knowledgeRequests.length, 0);
});

test("SBC: preserva todas as perguntas recebidas após a equipe", async () => {
  const f = fixture("SBC", [message("team", "Olá!", true), message("a", "Qual é o valor?", false), message("b", "Como funciona?", false)]);
  const context = await f.load();
  assert.equal(context.prompt.MENSAGENS_RECENTES_SEM_RESPOSTA.length, 2);
});

test("Osasco mantém bloqueio anterior quando a última mensagem é da equipe", async () => {
  const f = fixture("Osasco", [message("client", "Quero saber mais", false), message("team", "Olá!", true)]);
  await assert.rejects(f.load(), /última mensagem já é da equipe/i);
});

test("SBC não inventa contexto se nenhuma entrada da cliente foi encontrada", async () => {
  const f = fixture("SBC", [message("team", "Olá!", true)]);
  await assert.rejects(f.load(), /mensagem recente da cliente/i);
});
