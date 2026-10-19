import assert from "node:assert/strict";
import test from "node:test";

import {
  isNewLeadPipelineStage,
  normalizedPipelineStageName,
  resolveServiceStartUnit,
} from "../src/lib/pipeline/service-start-policy.ts";

test("reconhece somente as etapas iniciais como Novo Lead", () => {
  assert.equal(isNewLeadPipelineStage("Novo Lead"), true);
  assert.equal(isNewLeadPipelineStage("novo_lead"), true);
  assert.equal(isNewLeadPipelineStage("entrada"), true);
  assert.equal(isNewLeadPipelineStage("Em Atendimento"), false);
  assert.equal(isNewLeadPipelineStage("Agendado"), false);
});

test("normaliza o nome canônico da etapa de atendimento", () => {
  assert.equal(normalizedPipelineStageName("Em Atendimento"), "em_atendimento");
});

test("prioriza a unidade canônica da instância sobre o contato global", () => {
  assert.equal(resolveServiceStartUnit("SCS", "Osasco"), "Osasco");
  assert.equal(resolveServiceStartUnit("Osasco", " sbc "), "SBC");
  assert.equal(resolveServiceStartUnit(null, "SBC"), "SBC");
});

test("usa o contato somente quando a instância não identifica uma unidade comercial", () => {
  assert.equal(resolveServiceStartUnit("SCS", null), "SCS");
  assert.equal(resolveServiceStartUnit(" osasco ", "Todas"), "Osasco");
  assert.equal(resolveServiceStartUnit("SBC", "Barueri"), "SBC");
  assert.equal(resolveServiceStartUnit(null, "Todas"), null);
  assert.equal(resolveServiceStartUnit("Barueri", "Todas"), null);
});
