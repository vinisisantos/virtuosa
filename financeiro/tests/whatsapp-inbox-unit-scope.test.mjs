import assert from "node:assert/strict";
import test from "node:test";

import { resolveInboxConversationUnit } from "../src/lib/whatsapp/conversation-unit.ts";

test("prioriza a unidade da instância sobre a unidade global do contato", () => {
  assert.equal(resolveInboxConversationUnit("SCS", "SCS", "SBC"), "SCS");
  assert.equal(resolveInboxConversationUnit("SBC", "SBC", "Osasco"), "SBC");
});

test("usa a unidade selecionada quando a instância ainda não foi carregada", () => {
  assert.equal(resolveInboxConversationUnit(null, "SCS", "Osasco"), "SCS");
});

test("ignora escopos globais e usa o contato apenas como último fallback", () => {
  assert.equal(resolveInboxConversationUnit("Todas", "all", "Osasco"), "Osasco");
  assert.equal(resolveInboxConversationUnit(null, null, null), "");
});
