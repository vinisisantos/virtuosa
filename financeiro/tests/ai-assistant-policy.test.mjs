import assert from "node:assert/strict";
import test from "node:test";

import {
  AI_ASSISTANT_CONFIG_KEY,
  AI_ASSISTANT_DAILY_BUDGET_MICRO_USD,
  AI_ASSISTANT_MODEL,
  aiAssistantActualCost,
  normalizeAiAssistantMode,
  parseAiAssistantConfig,
} from "#lib/ai-assistant/policy";
import { isAliceUnit } from "#lib/ai-assistant/scope";
import {
  personalizeAiAssistantResponse,
  resolveAiAssistantContactName,
  sanitizeAiAssistantText,
} from "#lib/ai-assistant/privacy";
import { buildAliceAssistantRequest } from "#lib/ai-assistant/provider";
import { aliceLocalHandoffReply, classifyAliceHandoff } from "#lib/ai-assistant/safety";

test("Alice começa pausada, limitada às unidades aprovadas e sem modo agente", () => {
  const config = parseAiAssistantConfig(null);
  assert.equal(AI_ASSISTANT_CONFIG_KEY, "ai_assistant_alice_v1");
  assert.equal(config.enabled, false);
  assert.equal(config.unit, "Todas");
  assert.equal(config.agentEnabled, false);
  assert.equal(isAliceUnit("SBC"), true);
  assert.equal(isAliceUnit("Osasco"), true);
  assert.equal(isAliceUnit("SCS"), false);
});

test("configuração nunca libera agente e limita orçamento", () => {
  const config = parseAiAssistantConfig(JSON.stringify({
    enabled: true,
    agentEnabled: true,
    unit: "Osasco",
    dailyBudgetMicroUsd: 99_000_000,
    sharePrices: true,
  }));
  assert.equal(config.enabled, true);
  assert.equal(config.unit, "Todas");
  assert.equal(config.agentEnabled, false);
  assert.equal(config.dailyBudgetMicroUsd, AI_ASSISTANT_DAILY_BUDGET_MICRO_USD);
  assert.equal(config.sharePrices, true);
});

test("modo aceita apenas escrita manual ou sugestão revisável", () => {
  assert.equal(normalizeAiAssistantMode("manual"), "manual");
  assert.equal(normalizeAiAssistantMode("suggestions"), "suggestions");
  assert.throws(() => normalizeAiAssistantMode("agent"));
});

test("contexto enviado ao provedor mascara dados pessoais", () => {
  const sanitized = sanitizeAiAssistantText(
    "Maria, meu CPF é 123.456.789-00, telefone +55 (11) 99999-0000 e email maria@teste.com",
    ["Maria"],
  );
  assert.equal(sanitized.includes("Maria"), false);
  assert.equal(sanitized.includes("123.456.789-00"), false);
  assert.equal(sanitized.includes("99999-0000"), false);
  assert.equal(sanitized.includes("maria@teste.com"), false);
  assert.match(sanitized, /\[pessoa\]/);
  assert.match(sanitized, /\[documento\]/);
  assert.match(sanitized, /\[telefone\]/);
  assert.match(sanitized, /\[email\]/);
});

test("placeholder de pessoa recebe somente o primeiro nome válido salvo", () => {
  assert.equal(resolveAiAssistantContactName("Erice da Silva"), "Erice");
  assert.equal(resolveAiAssistantContactName("Erice 💜"), "Erice");
  assert.equal(
    personalizeAiAssistantResponse("Perfeito, [pessoa]! Fico no aguardo.", "Erice da Silva"),
    "Perfeito, Erice! Fico no aguardo.",
  );
});

test("contato identificado apenas por número não deixa nome nem placeholder", () => {
  assert.equal(resolveAiAssistantContactName("+55 11 99999-0000"), null);
  assert.equal(resolveAiAssistantContactName("5511999990000"), null);
  assert.equal(
    personalizeAiAssistantResponse("Perfeito, [pessoa]! Fico no aguardo.", "+55 11 99999-0000"),
    "Perfeito! Fico no aguardo.",
  );
});

test("custo GPT-6 Luna é calculado em microdólares", () => {
  assert.equal(aiAssistantActualCost(1_000, 500), 350);
});

test("requisição da Alice usa Luna, schema estrito, sem armazenamento e sem IDs do CRM", () => {
  const input = {
    BASE_ALICE: { revision: "pinned", documents: [{ source: "SAFETY.md", content: "Proteja dados." }] },
    UNIDADE: "SBC",
    MENSAGEM_ALVO: { id: "message-private-id", text: "Qual o valor?" },
    MENSAGENS_RECENTES_SEM_RESPOSTA: [{ id: "other-private-id", text: "Qual o valor?" }],
    CONVERSA: [{ role: "cliente", text: "Olá" }],
  };
  const request = buildAliceAssistantRequest(input);
  assert.equal(request.model, "gpt-6-luna");
  assert.equal(AI_ASSISTANT_MODEL, "gpt-6-luna");
  assert.equal(request.reasoning.effort, "xhigh");
  assert.equal(request.text.format.type, "json_schema");
  assert.equal(request.store, false);
  assert.match(request.instructions, /nunca diga que é IA/i);
  assert.match(request.instructions, /<base_privada_aprovada>/);
  const serializedInput = JSON.stringify(request.input);
  assert.equal(serializedInput.includes("message-private-id"), false);
  assert.equal(serializedInput.includes("other-private-id"), false);
  assert.equal(serializedInput.includes("SAFETY.md"), false);
  assert.match(request.instructions, /SAFETY\.md/);
});

test("mensagem sobre saúde encaminha localmente e evita avaliação clínica", () => {
  assert.equal(classifyAliceHandoff({ unit: "SBC", incomingMessages: ["Tenho diabetes e uso remédio. Posso fazer?"] }), "clinical_safety");
  assert.equal(classifyAliceHandoff({ unit: "Osasco", incomingMessages: ["Estou grávida, o que faço?"] }), "clinical_safety");
  assert.match(aliceLocalHandoffReply("clinical_safety"), /profissional habilitada/i);
});

test("escopo inativo vai para equipe; fala comercial sobre volume não dispara alerta clínico", () => {
  assert.equal(classifyAliceHandoff({ unit: "SBC", campaignName: "Preenchimento Facial", incomingMessages: ["Quero saber mais"] }), "unsupported_procedure");
  assert.equal(classifyAliceHandoff({ unit: "SBC", campaignName: "Harmonização de Mamas", incomingMessages: ["Quero saber mais"] }), "unsupported_procedure");
  assert.equal(classifyAliceHandoff({ unit: "SBC", incomingMessages: ["Quero melhorar o volume e a assimetria"] }), null);
});
