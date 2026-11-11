import assert from "node:assert/strict";
import test from "node:test";
import { guardAliceReply } from "../src/lib/alice/guards.ts";
import { structuredOutput } from "./fixtures/alice-structured-output.mjs";
import { scope, earlier } from "./fixtures/alice-memory-context.mjs";
import { buildAliceContext } from "../src/lib/alice/build-context.ts";
import { generateAliceStructuredReply } from "../src/lib/alice/structured-generation.ts";
import { contextInput } from "./fixtures/alice-memory-context.mjs";
import { providerResponse } from "./fixtures/alice-structured-output.mjs";

const context = (changes = {}) => ({ scope, presentationAt: earlier, appointment: null, contactName: "Cliente Teste", ...changes });

test("apresentação repetida é retirada sem perder a resposta útil nem deixar saudação órfã", () => {
  const proposal = structuredOutput({ resposta: ["Olá, Cliente Teste! Tudo bem? Sou a Alice, atendente da Virtuosa, e vou dar seguimento ao seu atendimento.", "De nada! Estou por aqui 😊"], seApresentouNestaResposta: true });
  const before = structuredClone(proposal);
  const result = guardAliceReply(proposal, context());
  assert.equal(result.status, "ready");
  assert.deepEqual(result.proposal.resposta, ["De nada! Estou por aqui 😊"]);
  assert.equal(result.proposal.seApresentouNestaResposta, false);
  assert.ok(result.events.some((event) => event.code === "presentation_removed" && event.messageIndex === 0));
  assert.deepEqual(proposal, before);
});

test("texto interno bloqueia o lote inteiro, inclusive se estiver no trecho de apresentação", () => {
  for (const text of ["Você pode responder assim", "Vale responder que sim", "Parece que não entendeu", "Your trial has ended",
    "Upgrade to VoiceInk Pro", "[NOTA interna]", "{texto}", "Você pode responder\nassim", "Sou a Alice. [NOTA]", "Você pode responder as\u200bsim"]) {
    const result = guardAliceReply(structuredOutput({ resposta: ["Mensagem segura", text] }), context());
    assert.equal(result.status, "handoff", text);
    assert.equal(result.reason, "internal_content");
    assert.equal(result.proposal, null);
    assert.deepEqual(result.events, [{ code: "internal_content", messageIndex: 1 }]);
    assert.doesNotMatch(JSON.stringify(result), /Mensagem segura|VoiceInk|NOTA interna/);
  }
});

test("normaliza negrito para WhatsApp preservando parágrafos, preços e palavras", () => {
  const text = "**Entendi sua dúvida** 😊\n\nO valor é **R$ 699,00** por região. Dia 10/11, às 10h30.";
  const result = guardAliceReply(structuredOutput({ resposta: [text] }), context());
  assert.equal(result.status, "ready");
  assert.equal(result.proposal.resposta[0], "*Entendi sua dúvida* 😊\n\nO valor é *R$ 699,00* por região. Dia 10/11, às 10h30.");
  assert.ok(result.events.some((event) => event.code === "markdown_normalized"));
});

test("até 200 palavras são preservadas; acima disso exige revisão sem cortar o lote", () => {
  const valid = Array(200).fill("sim").join(" ");
  const allowed = guardAliceReply(structuredOutput({ resposta: [valid] }), context());
  assert.equal(allowed.status, "ready");
  assert.equal(allowed.proposal.resposta[0], valid);
  const result = guardAliceReply(structuredOutput({ resposta: ["Primeira parte", `${valid} não`] }), context());
  assert.equal(result.status, "handoff");
  assert.equal(result.reason, "word_limit");
  assert.equal(result.proposal, null);
});

test("avaliação registrada encaminha preço à equipe, mas memória inferida não fabrica agenda", () => {
  const proposal = structuredOutput({ resposta: ["O valor é R$ 699,00."] });
  const appointment = { conversationId: scope.conversationId, unidade: "SBC", state: "AGENDADO", date: new Date("2026-11-10T13:00:00Z") };
  for (const state of ["AGENDADO", "CONFIRMADO"]) {
    const result = guardAliceReply(proposal, context({ appointment: { ...appointment, state } }));
    assert.equal(result.status, "handoff");
    assert.equal(result.reason, "price_after_booking");
    assert.equal(result.proposal, null);
  }
  assert.equal(guardAliceReply(proposal, context()).status, "ready");
  assert.equal(guardAliceReply(structuredOutput({ resposta: ["Tudo certo, até amanhã!"] }), context({ appointment })).status, "ready");
});

test("escopo e fatos inválidos não permitem resposta nem usam agenda de outra conversa", () => {
  const appointment = { conversationId: scope.conversationId, unidade: "SBC", state: "AGENDADO", date: earlier };
  for (const invalid of [null, context({ scope: { ...scope, unidade: "Osasco" } }), context({ scope: { ...scope, instanceId: "outra" } }),
    context({ presentationAt: new Date("inválido") }), context({ presentationAt: "ontem" }), context({ presentationAt: undefined }),
    context({ appointment: { ...appointment, conversationId: "outro-chat" } }), context({ appointment: { ...appointment, unidade: "Osasco" } }),
    context({ appointment: { ...appointment, state: "NOVO" } }), context({ appointment: { ...appointment, date: new Date("inválido") } })]) {
    const result = guardAliceReply(structuredOutput(), invalid);
    assert.equal(result.status, "handoff");
    assert.equal(result.reason, "invalid_context");
    assert.equal(result.proposal, null);
  }
});

test("baixa confiança e pedido de humano continuam bloqueados mesmo ao chamar a trava diretamente", () => {
  for (const proposal of [structuredOutput({ confidence: "low" }), structuredOutput({ escalarHumano: true, motivoEscalonamento: "Revisão clínica" })]) {
    const result = guardAliceReply(proposal, context());
    assert.equal(result.status, "handoff");
    assert.equal(result.reason, proposal.escalarHumano ? "human_review_requested" : "human_review_low_confidence");
    assert.equal(result.proposal, null);
  }
});

test("flag do modelo não transforma boas-vindas em apresentação enviada", () => {
  const result = guardAliceReply(structuredOutput({ resposta: ["Seja muito bem-vinda à Clínica Virtuosa!"], seApresentouNestaResposta: true }), context({ presentationAt: null }));
  assert.equal(result.status, "ready");
  assert.equal(result.proposal.seApresentouNestaResposta, false);
  const personal = guardAliceReply(structuredOutput({ resposta: ["Olá! Sou a **Alice**, da Clínica Virtuosa."], seApresentouNestaResposta: false }), context({ presentationAt: null }));
  assert.equal(personal.status, "ready");
  assert.equal(personal.proposal.seApresentouNestaResposta, true);
  assert.ok(personal.events.some((event) => event.code === "presentation_flag_corrected"));
});

test("trava mantém a barreira existente contra afirmação de reserva pelo modelo", () => {
  const result = guardAliceReply(structuredOutput({ resposta: ["Agendei para amanhã às 10h."] }), context());
  assert.equal(result.status, "handoff");
  assert.equal(result.reason, "unproven_booking");
});

test("apresentações históricas e boas-vindas repetidas são descartadas; cumprimento breve legítimo fica", () => {
  for (const text of ["Me chamo Claudenice.", "Sou atendente da Clínica Virtuosa.", "Seja muito bem-vinda!", "Darei continuidade ao seu atendimento.",
    "Olá, Cliente Teste! Sou a **Alice**, da Clínica Virtuosa 😊", "Sou a Ali\u200bce, da Clínica Virtuosa.", "Seja muito bem‑vinda!"]) {
    const result = guardAliceReply(structuredOutput({ resposta: [text] }), context());
    assert.equal(result.status, "skip", text);
    assert.equal(result.proposal, null);
    assert.ok(result.events.some((event) => event.code === "presentation_removed"));
  }
  const text = "Bom dia, Cliente Teste! Podemos continuar de onde paramos 😊";
  const result = guardAliceReply(structuredOutput({ resposta: [text] }), context());
  assert.equal(result.status, "ready");
  assert.deepEqual(result.proposal.resposta, [text]);
});

test("não apaga conteúdo clínico/comercial misturado com apresentação na mesma frase", () => {
  const proposal = structuredOutput({ resposta: ["Sou a Alice e o Lipo Laser custa R$ 699,00."] });
  const result = guardAliceReply(proposal, context());
  assert.equal(result.status, "handoff");
  assert.equal(result.reason, "presentation_not_separable");
  assert.equal(result.proposal, null);
});

test("mensagem limpa mantém parágrafos, não modifica memória e pode passar novamente sem alteração", () => {
  const text = "Sou a Alice, da Clínica Virtuosa.\n\nEntendi sua dúvida.\n\nVocê prefere sábado?";
  const result = guardAliceReply(structuredOutput({ resposta: [text] }), context());
  assert.equal(result.status, "ready");
  assert.deepEqual(result.proposal.resposta, ["Entendi sua dúvida.\n\nVocê prefere sábado?"]);
  const again = guardAliceReply(result.proposal, context());
  assert.equal(again.status, "ready");
  assert.deepEqual(again.proposal, result.proposal);
  assert.deepEqual(again.events, []);
});

test("schema continua rejeitando sequências acima do orçamento, corpos longos, vazios ou memória inválida", () => {
  for (const proposal of [null, {}, structuredOutput({ resposta: Array(33).fill("a") }), structuredOutput({ resposta: ["a".repeat(1_201)] }),
    structuredOutput({ resposta: [] }), structuredOutput({ resposta: ["  "] }), structuredOutput({ memoria: { resumo: "Teste", apresentacaoFeitaEm: "ontem" } })]) {
    const result = guardAliceReply(proposal, context());
    assert.equal(result.status, "handoff");
    assert.equal(result.reason, "invalid_proposal");
    assert.equal(result.proposal, null);
  }
});

test("retomadas com Aqui é a Alice e Eu sou a Alice não reiniciam a apresentação", () => {
  for (const text of ["Aqui é a Alice, da Virtuosa.", "Eu sou a Alice, atendente da Virtuosa.", "Aqui quem fala é a Alice, da Clínica Virtuosa."]) {
    const result = guardAliceReply(structuredOutput({ resposta: [text, "Podemos continuar 😊"] }), context());
    assert.equal(result.status, "ready");
    assert.deepEqual(result.proposal.resposta, ["Podemos continuar 😊"]);
  }
});

test("saída simulada do Sonnet passa pela trava com prova do histórico, sem nova apresentação", async () => {
  const prompt = buildAliceContext(contextInput());
  const proposal = structuredOutput({ resposta: ["Olá, Cliente Teste! Sou a Alice, da Clínica Virtuosa.", "De nada! Estou por aqui 😊"], seApresentouNestaResposta: true });
  const generated = await generateAliceStructuredReply({ scope, prompt }, { apiKey: "fake-isolated-key", fetcher: async () => providerResponse(proposal) });
  assert.equal(generated.status, "draft");
  const result = guardAliceReply(generated.proposal, context({ presentationAt: new Date(prompt.CONTROLES_CONTINUIDADE_ALICE.presentationAt) }));
  assert.equal(result.status, "ready");
  assert.deepEqual(result.proposal.resposta, ["De nada! Estou por aqui 😊"]);
  assert.equal(result.proposal.seApresentouNestaResposta, false);
});
