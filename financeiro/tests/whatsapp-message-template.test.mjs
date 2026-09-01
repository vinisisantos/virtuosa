import assert from "node:assert/strict";
import test from "node:test";

import { renderWhatsAppMessageTemplate } from "../src/lib/whatsapp/message-template.ts";
import { EVALUATION_SCHEDULE_UNIT_CONFIGS } from "../src/lib/whatsapp/evaluation-schedule-confirmation-message.ts";

const values = {
  contactName: "Maria da Silva",
  contactPhone: "5511999999999",
  unit: "Osasco",
  unitAddress: "Rua Eloy Cândido Lopes, 61 — Centro, Osasco",
  unitLocationUrl: "https://share.google/uwnrFMCt4re3TqvXI",
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

test("substitui endereço e localização conforme a unidade da conversa", () => {
  assert.equal(
    renderWhatsAppMessageTemplate(
      "📍 {{endereco}}\nLocalização: {{link_localizacao}}",
      values,
    ),
    "📍 Rua Eloy Cândido Lopes, 61 — Centro, Osasco\nLocalização: https://share.google/uwnrFMCt4re3TqvXI",
  );
});

test("resolve a mesma resposta LOCALIZAÇÃO sem misturar endereços das unidades", () => {
  const template = "📍 **Nossa localização**\n\nEstamos localizados em:\n\n**{{endereco}}**";

  for (const config of EVALUATION_SCHEDULE_UNIT_CONFIGS) {
    const rendered = renderWhatsAppMessageTemplate(template, {
      unit: config.displayUnitName,
      unitAddress: config.address,
      unitLocationUrl: config.locationUrl,
    });

    assert.match(rendered, new RegExp(config.address.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    for (const otherConfig of EVALUATION_SCHEDULE_UNIT_CONFIGS) {
      if (otherConfig.unit !== config.unit) assert.doesNotMatch(rendered, new RegExp(otherConfig.address.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
  }
});
