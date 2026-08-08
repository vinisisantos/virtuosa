import assert from "node:assert/strict";
import test from "node:test";

import { qualifiedLeadInstanceFilter } from "../src/lib/whatsapp/qualified-lead-scope.ts";

test("exige instância configurada para captar leads", () => {
  assert.deepEqual(qualifiedLeadInstanceFilter(), {
    capturesLeads: true,
  });
});

test("combina o caminho de leads com a unidade selecionada", () => {
  assert.deepEqual(qualifiedLeadInstanceFilter("Osasco"), {
    capturesLeads: true,
    unit: "Osasco",
  });
});
