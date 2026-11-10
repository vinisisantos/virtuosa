import assert from "node:assert/strict";
import test from "node:test";
import { aliceCanResumeGeneralFear, aliceFearPolicy, aliceFearInstructions, aliceHealthHistoryRequiresHuman, validateAliceFearReply } from "../src/lib/alice/fear-policy.ts";

const prompt = (text, older = []) => ({ UNIDADE: "SBC", CONVERSA: [...older, { role: "cliente", text }] });

test("medo geral recebe acolhimento, sem liberar condição clínica individual", () => {
  assert.equal(aliceFearPolicy(prompt("Tenho medo de agulha")).kind, "needles");
  assert.equal(aliceFearPolicy(prompt("E se der reação?")).generalInformationOnly, true);
  assert.equal(aliceFearPolicy(prompt("Tenho diabetes e uso medicação, tenho medo")).requiresHuman, true);
  assert.match(aliceFearInstructions(prompt("Tenho medo")), /sem urgência/i);
  assert.equal(aliceFearPolicy({ ...prompt("Tenho medo"), UNIDADE: "Osasco" }), null);
});

test("procedimentos anteriores não são convertidos em condição clínica, mas doença e reação seguem protegidas", () => {
  assert.equal(aliceHealthHistoryRequiresHuman("Já fez criolipólise e hidrolipo"), false);
  assert.equal(aliceHealthHistoryRequiresHuman("Tem diabetes e usa medicação"), true);
  assert.equal(aliceHealthHistoryRequiresHuman("Já teve reação com aplicação anterior"), true);
  assert.equal(aliceHealthHistoryRequiresHuman("Fez uma cirurgia bariátrica"), true);
  assert.equal(aliceHealthHistoryRequiresHuman(null), false);
});

test("receio geral depois de procedimentos prévios pode ser retomado, sem limpar escalonamento clínico real", () => {
  const dialogue = [
    { role: "cliente", text: "Entendi, preciso no sábado" },
    { role: "cliente", text: "Mas o que seria? É injetável?" },
    { role: "cliente", text: "Tenho um pouco de receio" },
  ];
  assert.equal(aliceCanResumeGeneralFear(dialogue, "Já fez criolipólise e hidrolipo"), true);
  assert.equal(aliceCanResumeGeneralFear([...dialogue, { role: "cliente", text: "Tenho diabetes e uso medicação" }],
    "Já fez criolipólise e hidrolipo"), false);
  assert.equal(aliceCanResumeGeneralFear(dialogue, "Já teve reação com aplicação anterior"), false);
});

const good = "É normal ter esse receio. É importante esclarecer suas dúvidas antes.\n\nA especialista avalia seu histórico e a região antes de conversar sobre a indicação. Não há garantia de ausência de riscos.\n\nA avaliação é gratuita e sem compromisso. Você decide com calma, só se se sentir segura.\n\nSe quiser, prefere durante a semana ou no sábado?";

test("acolhimento preserva controle, formato e bloqueia garantias, pressão e excesso de emojis", () => {
  const policy = aliceFearPolicy(prompt("Tenho medo"));
  assert.equal(validateAliceFearReply([good], policy, null), null);
  for (const text of ["Não tem risco", "100% seguro", "não dá reação", "nunca tivemos nenhum caso", "não dói", "99% das clientes", "você não vai se arrepender", "É bobagem ter medo"]) {
    assert.equal(validateAliceFearReply([`${good}\n\n${text}`], policy, null), "fear_unsafe_claim", text);
  }
  assert.equal(validateAliceFearReply([`${good}\n\nVale aproveitar enquanto a condição estiver disponível.`], policy, null), "fear_pressure");
  assert.equal(validateAliceFearReply([good.replaceAll("\n\n", " ")], policy, null), "fear_format");
  assert.equal(validateAliceFearReply([`${good} 😊 💛`], policy, null), "fear_format");
});
