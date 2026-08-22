import assert from "node:assert/strict";
import test from "node:test";

import { whatsappDeferredMediaUrl } from "../src/lib/whatsapp/deferred-media.ts";

test("preserva a instância selecionada ao carregar mídia omitida do histórico", () => {
  const url = new URL(
    whatsappDeferredMediaUrl("mensagem com espaço", "instancia-secundaria"),
    "https://clinicasgestao.com.br",
  );

  assert.equal(url.pathname, "/api/whatsapp/messages");
  assert.equal(url.searchParams.get("mediaMessageId"), "mensagem com espaço");
  assert.equal(url.searchParams.get("targetInstanceId"), "instancia-secundaria");
});

test("mantém compatibilidade com conversas próprias sem instância explícita", () => {
  const url = new URL(
    whatsappDeferredMediaUrl("mensagem"),
    "https://clinicasgestao.com.br",
  );

  assert.equal(url.searchParams.get("mediaMessageId"), "mensagem");
  assert.equal(url.searchParams.has("targetInstanceId"), false);
});
