import assert from "node:assert/strict";
import test from "node:test";
import { classifyAliceHandoff } from "../src/lib/ai-assistant/safety.ts";
import { selectAliceKnowledgeDocuments } from "../src/lib/ai-assistant/alice-knowledge-selection.ts";

test("pergunta administrativa de menor em SBC pode receber a política sem confirmação de elegibilidade",() => {
  for (const text of [
    "Menor de idade pode fazer o procedimento?",
    "Menor de 18 anos pode fazer o procedimento?",
    "Tenho 16 anos, posso fazer o procedimento?",
    "Minha filha tem 17 anos. Ela pode fazer o procedimento?",
    "Menor de idade precisa de autorização do responsável?",
    "Vocês trabalham com paciente modelo também?",
  ]) assert.equal(classifyAliceHandoff({unit:"SBC",incomingMessages:[text]}),null,text);
});

test("orientação de responsável não libera dúvida clínica, risco ou outra unidade",() => {
  for (const text of [
    "Tenho 16 anos e diabetes. Posso fazer o procedimento?",
    "Minha filha tem 17 anos e toma remédio. Pode fazer o procedimento?",
    "É seguro fazer o procedimento em menor de idade?",
    "Menor de idade pode fazer o procedimento? Quais os riscos?",
    "Qual a indicação desse procedimento para quem tem 16 anos?",
    "Tenho 16 anos e tive reação. Posso fazer?",
    "O valor é menor, posso fazer o procedimento?",
  ]) assert.equal(classifyAliceHandoff({unit:"SBC",incomingMessages:[text]}),"clinical_safety",text);
  assert.equal(classifyAliceHandoff({unit:"SBC",incomingMessages:["Tenho 16 anos, posso fazer o procedimento?","Estou grávida"]}),"clinical_safety");
  assert.equal(classifyAliceHandoff({unit:"Osasco",incomingMessages:["Menor de idade pode fazer o procedimento?"]}),"clinical_safety");
  assert.equal(classifyAliceHandoff({unit:"SBC",incomingMessages:["Paciente modelo para harmonização de mamas?"]}),"unsupported_procedure");
  assert.equal(classifyAliceHandoff({unit:"SBC",incomingMessages:["O procedimento pode durar 16 anos?"]}),null,"duração não é idade de uma pessoa");
});

test("política administrativa do manual obrigatório não é substituída por preferências guardadas na conversa",() => {
  const documents = ["AGENTS.md","IDENTITY.md","RULES.md","SAFETY.md","SALES.md","MEMORY.md","knowledge/clinic.md","knowledge/prices.md"]
    .map((path) => ({ path, content: "Fonte sintética de teste." }));
  documents.push({path:"knowledge/manual-atendimento-sbc.md",content:"POLITICA_ADMINISTRATIVA_APROVADA_PELA_GESTAO"});
  const chosen = selectAliceKnowledgeDocuments({documents,unit:"SBC",campaignName:"Glúteos Perfeitos",messageText:"Paciente modelo? Menor de idade?"});
  assert.ok(chosen.some(doc=>doc.source==="knowledge/manual-atendimento-sbc.md"&&doc.content.includes("POLITICA_ADMINISTRATIVA_APROVADA_PELA_GESTAO")));
  const other = selectAliceKnowledgeDocuments({documents,unit:"Osasco",campaignName:"",messageText:"Paciente modelo?"});
  assert.equal(other.some(doc=>doc.source==="knowledge/manual-atendimento-sbc.md"),false);
});
