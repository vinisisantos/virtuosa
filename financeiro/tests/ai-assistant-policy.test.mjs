import assert from "node:assert/strict";
import test from "node:test";

import {
  AI_ASSISTANT_DAILY_BUDGET_MICRO_USD,
  aiAssistantActualCost,
  normalizeAiAssistantMode,
  parseAiAssistantConfig,
} from "#lib/ai-assistant/policy";
import { sanitizeAiAssistantText } from "#lib/ai-assistant/privacy";
import { buildDeepSeekAssistantRequest } from "#lib/ai-assistant/provider";

test("assistente de SBC falha fechado sem configuração persistida", () => {
  const config = parseAiAssistantConfig(null);
  assert.equal(config.enabled, false);
  assert.equal(config.unit, "SBC");
  assert.equal(config.agentEnabled, false);
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
  assert.equal(config.unit, "SBC");
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

test("custo é calculado em microdólares para auditoria", () => {
  assert.equal(aiAssistantActualCost(1_000, 500), 900);
});

test("requisição do copiloto é stateless, estruturada e sem raciocínio", () => {
  const request = buildDeepSeekAssistantRequest({ CONVERSA: [{ role: "cliente", text: "Olá" }] });
  assert.equal(request.model, "deepseek-flash");
  assert.equal(request.reasoning.effort, "none");
  assert.equal(request.text.format.type, "json_schema");
  assert.equal("store" in request, false);
});
