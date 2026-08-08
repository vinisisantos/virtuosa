import assert from "node:assert/strict";
import test from "node:test";

import { renderWhatsAppMessageTemplate } from "../src/lib/whatsapp/message-template.ts";

const values = {
  contactName: "Maria da Silva",
  contactPhone: "5511999999999",
  unit: "Osasco",
  attendantName: "Claudenice",
};

test("substitui as variáveis disponíveis entre duas chaves", () => {
  assert.equal(
    renderWhatsAppMessageTemplate(
      "Olá, {{nome}}! Sou {{atendente}} da unidade {{unidade}}. Seu telefone é {{telefone}}.",
      values,
    ),
    "Olá, Maria da Silva! Sou Claudenice da unidade Osasco. Seu telefone é 5511999999999.",
  );
});

test("aceita caixa, acento, espaços e aliases de nome", () => {
  assert.equal(
    renderWhatsAppMessageTemplate(
      "{{ PRIMEIRO NOME }} | {{Nome Completo}} | {{NOME}}",
      values,
    ),
    "Maria | Maria da Silva | Maria da Silva",
  );
});

test("preserva variáveis desconhecidas ou sem valor", () => {
  assert.equal(
    renderWhatsAppMessageTemplate(
      "{{nome}} - {{campanha}} - {{unidade}}",
      { contactName: "Ana" },
    ),
    "Ana - {{campanha}} - {{unidade}}",
  );
});

test("não interpreta marcador com apenas uma chave", () => {
  assert.equal(
    renderWhatsAppMessageTemplate("Olá, {nome}!", values),
    "Olá, {nome}!",
  );
});
