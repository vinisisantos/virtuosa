import assert from "node:assert/strict";
import test from "node:test";
import { buildAliceAssistantRequest, normalizeAiAssistantMessageLayout, parseGeneration } from "#lib/ai-assistant/provider";
import { buildClaudeRequest } from "#lib/ai-assistant/claude-provider";
import { sbcGluteoConversationFlow } from "#lib/ai-assistant/gluteo-conversation-flow";
import { isSbcOpeningSequenceContext } from "#lib/ai-assistant/message-sequence";
import { personalizeAiAssistantResponse } from "#lib/ai-assistant/privacy";

const team = (text) => ({ role: "atendente", text });
const client = (text) => ({ role: "cliente", text });
const intro = team("Olá, sou a Alice, atendente da Virtuosa. Vou dar seguimento ao seu atendimento.");
const welcome = team("Olá! Seja muito bem-vinda(o) à Clínica Virtuosa. Recebemos seu contato e vamos te ajudar por aqui.");
const prompt = (messages, extra = {}) => ({ UNIDADE: "SBC", CAMPANHA: "Glúteos Perfeitos", CONVERSA: messages, ...extra });
const generated = (response, extra = {}) => parseGeneration({ response, confidence: "high", needsHuman: false, usedKnowledge: [], ...extra });
const premature = generated("O procedimento ajuda no volume e na flacidez. Prefere durante a semana ou no sábado?");
const apply = (input, value = premature) => normalizeAiAssistantMessageLayout(value, isSbcOpeningSequenceContext(input.UNIDADE, input), input);

test("a regra de qualificação substitui a ordem conflitante nos dois modelos", () => {
  const input = prompt([welcome, client("Volume e flacidez")]);
  for (const instructions of [buildAliceAssistantRequest(input).instructions, buildClaudeRequest(input).system]) {
    assert.match(instructions, /volume médio ou grande/);
    assert.match(instructions, /ainda não se apresentou/);
    assert.match(instructions, /aguarde a resposta/);
    assert.doesNotMatch(instructions, /Não peça nome, objetivo, nível de resultado/);
    assert.match(instructions, /base privada.*única fonte factual/);
  }
});

test("recepção automática não conta como apresentação pessoal e não libera convite", () => {
  const value = apply(prompt([welcome, team("O que mais te incomoda no bumbum?"), client("Volume e flacidez")]));
  assert.equal(value.messages.length, 2);
  assert.match(personalizeAiAssistantResponse(value.messages[0], "Marina Teste"), /Olá, Marina.*Alice.*Virtuosa/);
  assert.match(personalizeAiAssistantResponse(value.messages[0], null), /^Olá! Tudo bem/);
  assert.match(value.messages[1], /volume médio ou grande/);
  assert.doesNotMatch(value.messages.join(" "), /avaliação|semana|sábado|projeção|composição|Versiol|—|--|:/);
});

test("não repete apresentação enviada e aguarda resposta ao volume", () => {
  const input = prompt([welcome, client("Volume e flacidez"), intro]);
  const value = apply(input);
  assert.equal(value.messages.length, 1);
  assert.match(value.response, /médio ou grande/);
  const waiting = apply(prompt([...input.CONVERSA, team(value.response)]));
  assert.doesNotMatch(waiting.response, /médio|grande|agend|semana/);
});

test("volume médio ou grande já informado libera explicação e posterior convite, sem repetir descoberta", () => {
  for (const choice of ["Médio", "Grande", "Quero um ganho de volume médio", "Quero um bumbum bem grande", "Prefiro natural"]) {
    const input = prompt([intro, client("Volume e flacidez"), team("Busca volume médio ou grande?"), client(choice)]);
    assert.equal(sbcGluteoConversationFlow(input).volumeKnown, true, choice);
    assert.equal(apply(input).response, premature.response);
    const instructions = buildAliceAssistantRequest(input).instructions;
    assert.match(instructions, /só depois dessa explicação convide/);
    assert.match(instructions, /não prom|sem prometer/i);
  }
});

test("dúvida ou negação não define volume e interesse só em flacidez não vira busca por volume", () => {
  for (const choice of ["Volume médio ou grande?", "Não quero volume grande", "Talvez um volume médio"]) {
    const input = prompt([intro, client("Volume grande"), client(choice)]);
    assert.equal(sbcGluteoConversationFlow(input).volumeKnown, false);
    if (!choice.includes("?")) assert.match(apply(input).response, /médio ou grande/);
  }
  const input = prompt([intro, client("Só flacidez")]);
  assert.equal(sbcGluteoConversationFlow(input).needsVolumeDiscovery, false);
  assert.equal(apply(input).response, premature.response);
});

test("perguntas diretas pendentes ou selecionadas não são apagadas pela pergunta de volume", () => {
  for (const extra of [{ MENSAGENS_RECENTES_SEM_RESPOSTA: [{ text: "Qual o valor?" }, { text: "Volume e flacidez" }] }, { MENSAGEM_ALVO: { text: "Qual o valor?" } }]) {
    const input = prompt([intro, client("Volume e flacidez")], extra);
    const answer = generated("A condição está na oferta cadastrada. Você busca volume médio ou grande?");
    assert.equal(apply(input, answer).response, answer.response);
  }
});

test("encaminhamento clínico, Osasco, Botox e outras campanhas preservados", () => {
  const clinical = generated("Vou chamar a profissional para orientar você.", { needsHuman: true });
  assert.equal(apply(prompt([welcome, client("Volume e flacidez")]), clinical).response, clinical.response);
  for (const extra of [{ UNIDADE: "Osasco" }]) {
    assert.equal(apply(prompt([welcome, client("Volume e flacidez")], extra)).response, premature.response);
  }
  for (const campaign of ["Lipo Laser", "Botox Terço Superior", "Barriga Trincada"]) {
    const result = apply(prompt([welcome, client("Quero saber mais")], { CAMPANHA: campaign }));
    assert.match(result.messages[0], /Alice.*Virtuosa/);
    assert.equal(result.messages[1], premature.response);
    assert.doesNotMatch(result.messages.join(" "), /médio ou grande/);
  }
  assert.equal(isSbcOpeningSequenceContext("SBC", prompt([welcome])), true);
  assert.equal(isSbcOpeningSequenceContext("Osasco", prompt([welcome], { UNIDADE: "Osasco" })), false);
});
