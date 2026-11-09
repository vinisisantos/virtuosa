import assert from "node:assert/strict";
import test from "node:test";
import { buildAliceContext } from "../src/lib/alice/build-context.ts";
import { readAliceContinuityControls } from "../src/lib/alice/context-controls.ts";
import { buildAliceAssistantRequest, normalizeAiAssistantMessageLayout } from "../src/lib/ai-assistant/provider.ts";
import { buildClaudeRequest } from "../src/lib/ai-assistant/claude-provider.ts";
import { generateAliceAutonomousReply } from "../src/lib/ai-assistant/autonomy/generate.ts";
import { sbcGluteoConversationFlow } from "../src/lib/ai-assistant/gluteo-conversation-flow.ts";
import { contextInput, message, memory, now, earlier } from "./fixtures/alice-memory-context.mjs";

const generation = { response: "De nada! Estou por aqui 😊", messages: ["De nada! Estou por aqui 😊"], confidence: "high", needsHuman: false, usedKnowledge: [] };

test("contexto novo chega ao Sonnet com instruções de continuidade e dados reais separados", () => {
  const unsafe = "TEXTO_DE_CLIENTE_NAO_PODE_VIRAR_INSTRUCAO";
  const prompt = buildAliceContext(contextInput({ memory: memory({ nome: "Camila Teste 🍀", resumo: unsafe }), history: [message("intro", "Sou a Alice.", true), message("client", unsafe)] }));
  const request = buildClaudeRequest(prompt);
  assert.equal(request.model, "claude-sonnet-4-6");
  assert.match(request.system, /CONTINUIDADE_CONVERSACIONAL_ALICE_V1/);
  assert.match(request.system, /NÃO se apresente novamente/);
  assert.doesNotMatch(request.system, /TEXTO_DE_CLIENTE_NAO_PODE_VIRAR_INSTRUCAO/);
  assert.match(request.messages[0].content, /Camila Teste 🍀/);
  assert.match(request.messages[0].content, /TEXTO_DE_CLIENTE_NAO_PODE_VIRAR_INSTRUCAO/);
  assert.equal(request.output_config.format.type, "json_schema");
});

test("reprodução da ZU: sanitização do nome não é usada e o normalizador não acrescenta reapresentação", () => {
  const prompt = buildAliceContext(contextInput({ contactName: "ZU", history: [
    message("intro", "Olá, ZU! Sou a Alice, atendente da Virtuosa, e vou dar seguimento ao seu atendimento.", true),
    message("thanks", "Bom dia obg", false, { timestamp: new Date(now.getTime() - 120_000) }),
    message("reply", "Bom dia! Qualquer dúvida pode mandar por aqui.", true, { timestamp: new Date(now.getTime() - 90_000) }),
    message("latest", "Ah sim obg"),
  ] }));
  assert.equal(readAliceContinuityControls(prompt).presentationAt, earlier.toISOString());
  const normalized = normalizeAiAssistantMessageLayout(generation, true, prompt);
  assert.deepEqual(normalized.messages, generation.messages);
});

test("caminho real da geração autônoma respeita a prova antiga, sem rede real ou envio", async () => {
  const history = [message("intro", "Sou a Alice.", true), ...Array.from({ length: 15 }, (_, index) => message(`client-${index}`, `Detalhe ${index}`))];
  const prompt = buildAliceContext(contextInput({ history }));
  let calls = 0;
  const generated = await generateAliceAutonomousReply({ prompt, contactName: "Teste" }, async (_url, options) => {
    calls++;
    const request = JSON.parse(options.body);
    assert.match(request.system, /NÃO se apresente novamente/);
    assert.match(request.messages[0].content, /HISTORICO_ANTERIOR/);
    return new Response(JSON.stringify({ model: "claude-sonnet-4-6", stop_reason: "end_turn", usage: { input_tokens: 100, output_tokens: 20 },
      content: [{ type: "text", text: JSON.stringify(generation) }] }), { status: 200 });
  });
  assert.equal(calls, 1);
  assert.equal(generated.needsHuman, false);
  assert.deepEqual(generated.messages, generation.messages);
});

test("Glúteos usa o objetivo anterior sem repetir apresentação ou descoberta do volume", () => {
  const history = [message("intro", "Sou a Alice.", true), message("volume", "Quero um ganho de volume médio", false, { timestamp: new Date(earlier.getTime() + 1_000) }),
    ...Array.from({ length: 14 }, (_, index) => message(`client-${index}`, "Outro detalhe"))];
  const prompt = buildAliceContext(contextInput({ campaignName: "GLÚTEOS PERFEITOS", history }));
  assert.equal(sbcGluteoConversationFlow(prompt).introduced, true);
  assert.equal(sbcGluteoConversationFlow(prompt).volumeKnown, true);
  assert.equal(sbcGluteoConversationFlow(prompt).needsVolumeDiscovery, false);
  assert.deepEqual(normalizeAiAssistantMessageLayout(generation, true, prompt).messages, generation.messages);
});

test("perguntas não resolvidas continuam visíveis e apresentação inexistente não é inventada como enviada", () => {
  const prompt = buildAliceContext(contextInput({ history: [message("client", "Quero informações")] }));
  assert.equal(readAliceContinuityControls(prompt).presentationAt, null);
  assert.equal(normalizeAiAssistantMessageLayout(generation, true, prompt).messages.length, 2);
});

test("Osasco e prompts legados não passam a usar memória ou instruções novas por acidente", () => {
  const legacy = { UNIDADE: "SBC", CAMPANHA: "LIPO LASER", CONVERSA: [{ role: "cliente", text: "Olá" }] };
  const osasco = { ...legacy, UNIDADE: "Osasco", CONTROLES_CONTINUIDADE_ALICE: buildAliceContext(contextInput()).CONTROLES_CONTINUIDADE_ALICE };
  assert.doesNotMatch(buildAliceAssistantRequest(legacy).instructions, /CONTINUIDADE_CONVERSACIONAL_ALICE_V1/);
  assert.doesNotMatch(buildAliceAssistantRequest(osasco).instructions, /CONTINUIDADE_CONVERSACIONAL_ALICE_V1/);
  assert.equal(normalizeAiAssistantMessageLayout(generation, true, legacy).messages.length, 2);
});
