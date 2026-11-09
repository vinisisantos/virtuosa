import assert from "node:assert/strict";
import test from "node:test";
import { normalizeAiAssistantMessageLayout, parseGeneration } from "#lib/ai-assistant/provider";
import { personalizeAiAssistantResponse } from "#lib/ai-assistant/privacy";
import { formatAliceResponse } from "#lib/ai-assistant/response-format";
import { buildAliceAssistantRequest } from "#lib/ai-assistant/provider";
import { buildClaudeRequest } from "#lib/ai-assistant/claude-provider";

// Texto fornecido no print: fixture de formatação, não validação de alegações clínicas.
const longResponse = "O Lipo Laser é um tratamento não invasivo que trabalha com luz laser de baixa frequência para ajudar a reduzir medidas em regiões específicas. Aqui na clínica o valor é R$ 699,00 por sessão, por região tratada — abdômen inferior, flancos, costas e braços são regiões distintas, então o valor pode variar conforme o que você quer tratar. A quantidade de sessões e as melhores condições são definidas pela especialista na avaliação, que é gratuita e sem compromisso. O que mais te incomoda hoje? Medidas, gordura localizada, flacidez ou outra situação?";
const prompt = { UNIDADE: "SBC", CAMPANHA: "Lipo Laser", CONVERSA: [{ role: "atendente", text: "Sou a Alice, atendente da Virtuosa." }] };
const generation = (response) => parseGeneration({ response, confidence: "high", needsHuman: false, usedKnowledge: [] });
const words = (text) => text.match(/[\p{L}\p{M}\p{N}]+/gu);

test("resposta explicativa longa ganha parágrafos sem perder palavras, preço ou pergunta", () => {
  const formatted = normalizeAiAssistantMessageLayout(generation(longResponse), true, prompt);
  assert.match(formatted.response, /\n\n/);
  assert.doesNotMatch(formatted.response, /—|\s--\s/);
  assert.deepEqual(words(formatted.response), words(longResponse));
  assert.match(formatted.response, /R\$ 699,00 por sessão/);
  assert.equal(formatted.messages.length, 1, "parágrafos não viram novos envios");
  assert.match(personalizeAiAssistantResponse(formatted.response, "Marina"), /\n\n/);
});

test("orientação de ambos os modelos pede parágrafos sem encurtar a explicação", () => {
  for (const instructions of [buildAliceAssistantRequest(prompt).instructions, buildClaudeRequest(prompt).system]) {
    assert.match(instructions, /FORMATO_LEGIVEL_SBC/);
    assert.match(instructions, /sem encurtá-la/);
    assert.match(instructions, /linha em branco/);
    assert.match(instructions, /Não use travessão/);
  }
});

test("preserva preços, datas, horários, hífens e intervalos numéricos legítimos", () => {
  const text = "Dia 08/11/2026, às 10h30. Valor R$ 699,00 ou 12x R$ 249,92. Faixa R$ 699,00 — R$ 2.999,00. Atendimento 10h – 20h. Bem-estar e pós-procedimento. Não-invasivo.";
  assert.equal(formatAliceResponse(text), text);
  assert.equal(formatAliceResponse("Explicação — outra frase. Explicação -- outra frase."), "Explicação, outra frase. Explicação, outra frase.");
});

test("não destrói parágrafos, listas, abreviações ou frases sem ponto intermediário", () => {
  const paragraphs = "Primeiro assunto.\n\nSegundo assunto.\n\nTudo bem?";
  assert.equal(formatAliceResponse(paragraphs), paragraphs);
  const list = "Horários disponíveis\n- 10h30\n- 11h00\n\nVocê prefere qual?";
  assert.equal(formatAliceResponse(list), list);
  const abbreviationText = `${"Uma explicação completa e legível. ".repeat(10)}A Dra. Ana orientará você. A avaliação é necessária.`;
  const formatted = formatAliceResponse(abbreviationText);
  assert.doesNotMatch(formatted, /Dra\.\n\nAna/);
  assert.deepEqual(words(formatted), words(abbreviationText));
  const noBoundary = "Uma frase longa sem ponto intermediário ".repeat(15).trim();
  assert.equal(formatAliceResponse(noBoundary), noBoundary);
});

test("a formatação é repetível e nunca corta informação para caber no limite", () => {
  assert.equal(formatAliceResponse(formatAliceResponse(longResponse)), formatAliceResponse(longResponse));
  const text = "Uma explicação completa. ".repeat(49).trim();
  const formatted = formatAliceResponse(text, text.length + 1);
  assert.ok(formatted.length <= text.length + 1);
  assert.deepEqual(words(formatted), words(text));
});

test("preserva duas mensagens separadas e não modifica sugestões de Osasco", () => {
  const value = parseGeneration({ response: "Olá!", messages: ["Olá!", longResponse], confidence: "high", needsHuman: false, usedKnowledge: ["fonte-aprovada"] });
  const formatted = normalizeAiAssistantMessageLayout(value, true, prompt);
  assert.equal(formatted.messages.length, 2);
  assert.equal(formatted.response, formatted.messages[0]);
  assert.match(formatted.messages[1], /\n\n/);
  assert.deepEqual(formatted.usedKnowledge, value.usedKnowledge);
  assert.deepEqual(normalizeAiAssistantMessageLayout(value, true, { ...prompt, UNIDADE: "Osasco" }), value);
});
