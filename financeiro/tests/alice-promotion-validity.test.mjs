import assert from "node:assert/strict";
import test from "node:test";
import { normalizeAiAssistantMessageLayout, parseGeneration } from "#lib/ai-assistant/provider";
import { buildAliceAssistantRequest } from "#lib/ai-assistant/provider";
import { buildClaudeRequest } from "#lib/ai-assistant/claude-provider";
import { arrivedFromIdentifiedAdToday, sameDayAdPromotionReply } from "#lib/ai-assistant/promotion-validity";

const prompt = { UNIDADE: "SBC", CAMPANHA: "Lipo Laser", CONVERSA: [
  { role: "atendente", text: "Olá! Recebemos seu contato." },
  { role: "cliente", text: "Essa promoção vai até quando?" },
] };
const previousAnswer = parseGeneration({ response: "Não tenho a data de término confirmada. Vou encaminhar sua dúvida para a equipe confirmar com você.", confidence: "high", needsHuman: true, usedKnowledge: [] });

test("dúvida apenas sobre término da promoção usa a política oficial sem encaminhamento desnecessário", () => {
  const result = normalizeAiAssistantMessageLayout(previousAnswer, true, prompt);
  assert.equal(result.needsHuman, false);
  assert.match(result.messages.join(" "), /marketing/);
  assert.match(result.messages.join(" "), /não temos.*data|não há.*data/i);
  assert.match(result.messages.join(" "), /enquanto.*disponível/i);
  assert.doesNotMatch(result.messages.join(" "), /encaminhar|vou verificar|termina hoje|termina amanhã|última chance/i);
});

function withQuestion(text, extra = {}) {
  return { ...prompt, CONVERSA: [{ role: "atendente", text: "Sou a Alice, da Virtuosa. Estamos com uma condição promocional." }, { role: "cliente", text }], ...extra };
}

test("prazos de promoção, oferta e preço são respondidos sem inventar data", () => {
  for (const text of ["Até quando vai essa promoção?", "Qual é a validade da oferta?", "Qual a validade dessa promoção?", "Essa condição fica até o fim do mês?", "Esse valor de R$699,00 vai até quando?", "A promoção dura quanto tempo?", "Quando termina a promoção?", "Essa promoção termina quando?", "Vai acabar hoje?", "Até quando?", "Boa noite, essa promoção vai até quando, por favor?"]) {
    const result = normalizeAiAssistantMessageLayout(previousAnswer, true, withQuestion(text));
    assert.equal(result.needsHuman, false, text);
    assert.match(result.response, /marketing/, text);
    assert.doesNotMatch(result.response, /vou verificar|confirme com a equipe/i);
  }
});

test("regra compartilhada não promete data, reserva ou congelamento de preço", () => {
  for (const instructions of [buildAliceAssistantRequest(prompt).instructions, buildClaudeRequest(prompt).system]) {
    assert.match(instructions, /VALIDADE_PROMOCIONAL_SBC/);
    assert.match(instructions, /Não afirme que acaba hoje, amanhã/);
    assert.match(instructions, /Não prometa manter preço por agendar/);
    assert.match(instructions, /não marque needsHuman/);
  }
  assert.doesNotMatch(buildAliceAssistantRequest({ ...prompt, UNIDADE: "Osasco" }).instructions, /VALIDADE_PROMOCIONAL_SBC/);
});

test("mensagens pendentes e pergunta selecionada preservam dúvidas adicionais e segurança", () => {
  for (const text of ["Essa promoção vai até quando? Estou grávida, posso fazer?", "Essa promoção vai até quando e quanto custa?", "Essa promoção vai até quando? Se eu marcar hoje garante o preço?", "Até quando devo usar o remédio?", "Qual é o valor?", "Quero agendar amanhã às 11h"]) {
    assert.equal(normalizeAiAssistantMessageLayout(previousAnswer, true, withQuestion(text)).needsHuman, true, text);
  }
  const mixed = withQuestion("Essa promoção vai até quando?", { MENSAGENS_RECENTES_SEM_RESPOSTA: [{ text: "Essa promoção vai até quando?" }, { text: "Tenho alergia, posso fazer?" }] });
  assert.equal(normalizeAiAssistantMessageLayout(previousAnswer, true, mixed).needsHuman, true);
  const target = withQuestion("Essa promoção vai até quando?", { MENSAGEM_ALVO: { text: "Quanto custa?" } });
  assert.equal(normalizeAiAssistantMessageLayout(previousAnswer, true, target).needsHuman, true);
  const greeting = withQuestion("Essa promoção vai até quando?", { MENSAGENS_RECENTES_SEM_RESPOSTA: [{ text: "Bom dia" }, { text: "Essa promoção vai até quando?" }] });
  assert.equal(normalizeAiAssistantMessageLayout(previousAnswer, true, greeting).needsHuman, false);
});

test("Osasco e procedimentos fora de escopo não têm encaminhamento removido", () => {
  for (const extra of [{ UNIDADE: "Osasco" }, { CAMPANHA: "Harmonização de Mamas" }, { CAMPANHA: "Preenchimento Facial" }]) {
    assert.equal(normalizeAiAssistantMessageLayout(previousAnswer, true, withQuestion("Essa promoção vai até quando?", extra)).needsHuman, true);
  }
  const noContext = { ...prompt, CONVERSA: [{ role: "cliente", text: "Até quando?" }], CAMPANHA: "" };
  assert.equal(normalizeAiAssistantMessageLayout(previousAnswer, true, noContext).needsHuman, true);
});

test("confirma a vigência de hoje para a oferta do anúncio identificado", () => {
  for (const text of ["Essa promoção está válida?", "A oferta ainda está ativa?", "Essa promoção vai até quando?"]) {
    const input = withQuestion(text, { ANUNCIO_DE_ORIGEM_RECEBIDO_HOJE: true });
    const result = normalizeAiAssistantMessageLayout(previousAnswer, true, input);
    assert.equal(result.needsHuman, false, text);
    assert.match(result.messages.join(" "), /vigente hoje/i, text);
  }
  const withoutEvidence = normalizeAiAssistantMessageLayout(previousAnswer, true, withQuestion("Essa promoção está válida?"));
  assert.equal(withoutEvidence.needsHuman, true);
});

test("usa atribuição e dia de São Paulo para comprovar a chegada pelo anúncio", () => {
  const now = new Date("2026-11-28T02:50:00Z");
  const client = { campaignAttribution: "automatic_meta", arrivedAt: new Date("2026-11-27T19:04:11Z") };
  assert.equal(arrivedFromIdentifiedAdToday(client, "Glúteo Perfeito", now), true);
  assert.equal(arrivedFromIdentifiedAdToday(client, "Glúteo Perfeito", new Date("2026-11-28T03:00:00Z")), false);
  assert.equal(arrivedFromIdentifiedAdToday({ ...client, campaignAttribution: "manual" }, "Glúteo Perfeito", now), false);
  assert.equal(arrivedFromIdentifiedAdToday({ ...client, arrivedAt: null }, "Glúteo Perfeito", now), false);
  assert.equal(arrivedFromIdentifiedAdToday(client, "Via link", now), false);
  assert.equal(arrivedFromIdentifiedAdToday({ ...client, arrivedAt: new Date("2026-11-28T02:55:00Z") }, "Glúteo Perfeito", now), false);
});

test("preserva perguntas adicionais e o prazo explicitamente aprovado", () => {
  const mixed = withQuestion("São 30 ml de cada lado?", { ANUNCIO_DE_ORIGEM_RECEBIDO_HOJE: true,
    MENSAGENS_RECENTES_SEM_RESPOSTA: [{ text: "Essa promoção está válida?" }, { text: "São 30 ml de cada lado?" }] });
  assert.match(buildClaudeRequest(mixed).system, /confirme que a oferta está vigente hoje/i);
  assert.equal(normalizeAiAssistantMessageLayout(previousAnswer, true, mixed).response, previousAnswer.response);
  const clinical = withQuestion("Essa promoção está válida? Estou grávida, posso fazer?", { ANUNCIO_DE_ORIGEM_RECEBIDO_HOJE: true });
  assert.equal(normalizeAiAssistantMessageLayout(previousAnswer, true, clinical).needsHuman, true);
  const expired = withQuestion("Essa promoção está válida?", { CAMPANHA: "BOTOX PINK FRIDAY",
    ANUNCIO_DE_ORIGEM_RECEBIDO_HOJE: true, TEMPO_CONVERSA: { agora: "2026-11-30T03:00:00Z" } });
  assert.match(normalizeAiAssistantMessageLayout(previousAnswer, true, expired).messages.join(" "), /terminou em 29\/11\/2026/i);
});

test("resposta de marca do Botox Pink Friday preserva vigência, escopo e dúvidas adicionais", () => {
  const input = withQuestion("Essa promoção ainda tá? E qual é a marca da toxina?", { CAMPANHA: "BOTOX PINK FRIDAY",
    TEMPO_CONVERSA: { agora: "2026-11-30T02:59:59Z" } });
  assert.match(sameDayAdPromotionReply(input), /válida até 29\/11\/2026.*Dysport/u);
  assert.match(sameDayAdPromotionReply({ ...input, TEMPO_CONVERSA: { agora: "2026-11-30T03:00:00Z" } }), /terminou.*era Dysport/u);
  for (const extra of [{ UNIDADE: "Osasco" }, { CAMPANHA: "Botox Terço Superior" }, { CAMPANHA: "ENDOLASER PINK FRIDAY" },
    { MENSAGEM_ALVO: { text: "Estou grávida, posso fazer?" } }, { MENSAGEM_ALVO: { text: "Pode me agendar amanhã?" } },
    { MENSAGEM_ALVO: { text: "Qual o preço inteiro?" } }]) {
    assert.equal(sameDayAdPromotionReply({ ...input, ...extra }), null);
  }
});
