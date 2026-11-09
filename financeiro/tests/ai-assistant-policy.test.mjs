import assert from "node:assert/strict";
import test from "node:test";

import {
  AI_ASSISTANT_CONFIG_KEY,
  AI_ASSISTANT_DAILY_BUDGET_MICRO_USD,
  AI_ASSISTANT_MODEL,
  normalizeAiAssistantMode,
  parseAiAssistantConfig,
  validateAiAssistantConfigInput,
} from "#lib/ai-assistant/policy";
import { isAliceUnit } from "#lib/ai-assistant/scope";
import {
  personalizeAiAssistantResponse,
  resolveAiAssistantContactName,
  sanitizeAiAssistantText,
} from "#lib/ai-assistant/privacy";
import { buildAliceAssistantRequest, normalizeAiAssistantMessageLayout, parseGeneration } from "#lib/ai-assistant/provider";
import { canUseAliceSuggestions, requireAliceAuthorizedUser } from "#lib/ai-assistant/access";
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

test("alterar somente a ativação preserva as orientações comerciais existentes", () => {
  const current = parseAiAssistantConfig(JSON.stringify({
    enabled: false,
    businessHours: "Sábado até 13h",
    paymentPolicy: "Condições verificadas na avaliação",
    customInstructions: "Pergunte primeiro a dor da cliente",
    sharePrices: true,
  }));
  const updated = validateAiAssistantConfigInput({ enabled: true }, current);
  assert.equal(updated.enabled, true);
  assert.equal(updated.businessHours, current.businessHours);
  assert.equal(updated.paymentPolicy, current.paymentPolicy);
  assert.equal(updated.customInstructions, current.customInstructions);
  assert.equal(updated.sharePrices, true);
  assert.equal(updated.agentEnabled, false);
});

test("modo reconhece agente, cuja ativação depende da autorização específica da rota SBC", () => {
  assert.equal(normalizeAiAssistantMode("manual"), "manual");
  assert.equal(normalizeAiAssistantMode("suggestions"), "suggestions");
  assert.equal(normalizeAiAssistantMode("agent"), "agent");
  assert.throws(() => normalizeAiAssistantMode("autonomous"));
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

test("somente os dois IDs configurados podem usar Alice", () => {
  const previous = process.env.ALICE_OWNER_USER_ID;
  const previousSecondary = process.env.ALICE_SECONDARY_USER_ID;
  try {
    delete process.env.ALICE_OWNER_USER_ID;
    process.env.ALICE_SECONDARY_USER_ID = "claudenice";
    assert.equal(canUseAliceSuggestions("vinicius"), false);
    assert.equal(canUseAliceSuggestions("claudenice"), false);
    assert.throws(() => requireAliceAuthorizedUser("vinicius"), /usuários autorizados/);
    process.env.ALICE_OWNER_USER_ID = "vinicius";
    assert.equal(canUseAliceSuggestions("vinicius"), true);
    assert.equal(canUseAliceSuggestions("claudenice"), true);
    assert.equal(canUseAliceSuggestions("outro"), false);
  } finally {
    if (previous === undefined) delete process.env.ALICE_OWNER_USER_ID;
    else process.env.ALICE_OWNER_USER_ID = previous;
    if (previousSecondary === undefined) delete process.env.ALICE_SECONDARY_USER_ID;
    else process.env.ALICE_SECONDARY_USER_ID = previousSecondary;
  }
});

test("requisição da Alice usa Luna, schema de saída e sem IDs do CRM", () => {
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
  assert.equal(request.reasoning, "xhigh");
  assert.equal(request.responseSchema.type, "object");
  assert.equal(request.store, false);
  assert.match(request.instructions, /na primeira resposta, apresente-se como Alice/i);
  assert.match(request.instructions, /sem anunciar espontaneamente que é IA/i);
  assert.match(request.instructions, /se a pessoa perguntar diretamente, explique com transparência que é assistente virtual/i);
  assert.doesNotMatch(request.instructions, /nunca exponha que não é humana/i);
  assert.match(request.instructions, /<base_privada_aprovada>/);
  const serializedInput = JSON.stringify(request.input);
  assert.equal(serializedInput.includes("message-private-id"), false);
  assert.equal(serializedInput.includes("other-private-id"), false);
  assert.equal(serializedInput.includes("SAFETY.md"), false);
  assert.match(request.instructions, /SAFETY\.md/);
});

test("instruções priorizam a queixa e não pedem nome antes do agendamento em SBC", () => {
  const request = buildAliceAssistantRequest({ UNIDADE: "SBC" });
  assert.match(request.instructions, /Em SBC, se o nome não estiver disponível.*somente ao preparar o agendamento/);
  assert.match(request.instructions, /Em SBC, acolha a queixa já informada/);
  assert.match(request.instructions, /PADRAO_DE_ATENDIMENTO_SBC, válido para todos os procedimentos/);
  assert.match(request.instructions, /detalhe relevante.*esclareça antes de explicar/);
  assert.match(request.instructions, /semana ou no sábado/);
  assert.match(request.instructions, /não invente horários nem confirme reserva sem validação real/);
  assert.match(request.instructions, /Nas demais unidades, pergunte o nome/);
});

test("SBC recebe orientações de escrita natural e considera respostas posteriores da equipe", () => {
  const sbc = buildAliceAssistantRequest({ UNIDADE: "SBC" });
  const osasco = buildAliceAssistantRequest({ UNIDADE: "Osasco" });
  assert.match(sbc.instructions, /tom de WhatsApp de SBC/i);
  assert.match(sbc.instructions, /travessões/i);
  assert.match(sbc.instructions, /dois-pontos/i);
  assert.match(sbc.instructions, /respostas posteriores da equipe/i);
  assert.match(sbc.instructions, /saudação.*não significa/i);
  assert.doesNotMatch(osasco.instructions, /tom de WhatsApp de SBC/i);
});

test("ambas as unidades recebem orientação para escrita natural sem pontuação artificial", () => {
  for (const unit of ["SBC", "Osasco"]) {
    const { instructions } = buildAliceAssistantRequest({ UNIDADE: unit });
    assert.match(instructions, /em todas as unidades.*travessões.*dois-pontos/i);
  }
});

test("sugestões podem trazer duas mensagens separadas sem alterar respostas antigas", () => {
  const basic = { response: "Olá!", confidence: "high", needsHuman: false, usedKnowledge: [] };
  assert.deepEqual(parseGeneration(basic).messages, ["Olá!"]);
  assert.deepEqual(parseGeneration({ ...basic, messages: ["Olá!", "É sua primeira vez?"] }).messages, ["Olá!", "É sua primeira vez?"]);
  assert.throws(() => parseGeneration({ ...basic, messages: ["Olá!", "  "] }));
  assert.throws(() => parseGeneration({ ...basic, messages: ["A", "B", "C"] }));
  const combined = normalizeAiAssistantMessageLayout(parseGeneration({ ...basic, messages: ["Olá!", "Tudo bem?"] }), false);
  assert.equal(combined.response, "Olá!\n\nTudo bem?");
  assert.equal(combined.messages.length, 1);
});

test("Glúteos SBC não pula apresentação e descoberta de volume após a recepção automática", () => {
  const prompt = { UNIDADE: "SBC", CAMPANHA: "Glúteo Perfeito", CONVERSA: [
    { role: "atendente", text: "Olá! Seja muito bem-vinda(o) à Clínica Virtuosa. Recebemos seu contato e vamos te ajudar por aqui." },
    { role: "atendente", text: "O que mais te incomoda? Volume, assimetria, flacidez ou outra coisa?" },
    { role: "cliente", text: "Volume e flacidez" },
  ] };
  const premature = parseGeneration({ response: "Entendi! O procedimento ajuda na projeção. Prefere durante a semana ou no sábado?", confidence: "high", needsHuman: false, usedKnowledge: [] });
  const result = normalizeAiAssistantMessageLayout(premature, false, prompt);
  assert.equal(result.messages.length, 2);
  assert.match(result.messages[0], /Alice.*atendente.*Virtuosa/i);
  assert.match(result.messages[1], /médio.*grande/i);
  assert.doesNotMatch(result.messages.join(" "), /semana|sábado|projeção|agend|Versiol/i);
});

test("mensagem sobre saúde encaminha localmente e evita avaliação clínica", () => {
  assert.equal(classifyAliceHandoff({ unit: "SBC", incomingMessages: ["Tenho diabetes e uso remédio. Posso fazer?"] }), "clinical_safety");
  assert.equal(classifyAliceHandoff({ unit: "Osasco", incomingMessages: ["Estou grávida, o que faço?"] }), "clinical_safety");
  for (const message of ["Estou amamentando", "Tenho alergias", "Uso medicamentos", "Fiz cirurgia recente", "Tenho diabete"]) {
    assert.equal(classifyAliceHandoff({ unit: "SBC", incomingMessages: [message] }), "clinical_safety", message);
  }
  assert.match(aliceLocalHandoffReply("clinical_safety"), /profissional habilitada/i);
});

test("dúvidas breves de risco, dor, anestesia ou Anvisa em SBC vão para profissional", () => {
  for (const message of ["Dói?", "Tem risco?", "Usa anestesia?", "Tem Anvisa?"]) {
    assert.equal(classifyAliceHandoff({ unit: "SBC", incomingMessages: [message] }), "clinical_safety", message);
  }
  assert.equal(classifyAliceHandoff({ unit: "Osasco", incomingMessages: ["Dói?"] }), null);
});

test("escopo inativo vai para equipe; fala comercial sobre volume não dispara alerta clínico", () => {
  assert.equal(classifyAliceHandoff({ unit: "SBC", campaignName: "Preenchimento Facial", incomingMessages: ["Quero saber mais"] }), "unsupported_procedure");
  assert.equal(classifyAliceHandoff({ unit: "SBC", campaignName: "Harmonização de Mamas", incomingMessages: ["Quero saber mais"] }), "unsupported_procedure");
  assert.equal(classifyAliceHandoff({ unit: "SBC", incomingMessages: ["Quero melhorar o volume e a assimetria"] }), null);
  assert.doesNotMatch(aliceLocalHandoffReply("unsupported_procedure"), /escopo|IA|robô/i);
});
