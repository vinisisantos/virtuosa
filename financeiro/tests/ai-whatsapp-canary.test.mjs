import assert from "node:assert/strict";
import test from "node:test";

import {
  AI_CURRENT_MODEL_SPEC,
  buildOpenAiResponsesRequest,
} from "../src/lib/ai-model-config.ts";
import {
  AI_WHATSAPP_CANARY_RESPONDER,
  aiWhatsAppCanaryActivityBlockReason,
  matchesAiWhatsAppCanaryTarget,
  normalizeAiWhatsAppCanaryPhone,
  readAiWhatsAppCanaryConfig,
} from "../src/lib/ai-whatsapp-canary-policy.ts";

function config() {
  return readAiWhatsAppCanaryConfig({
    AI_WHATSAPP_CANARY_ENABLED: "true",
    AI_WHATSAPP_CANARY_INSTANCE_ID: "private-instance",
    AI_WHATSAPP_CANARY_PHONE: "11999998888",
    AI_WHATSAPP_CANARY_JID: "5511999998888@s.whatsapp.net",
    AI_WHATSAPP_CANARY_KNOWLEDGE_UNIT: "Osasco",
    AI_WHATSAPP_CANARY_INCLUDE_CADERNO: "true",
    AI_WHATSAPP_CANARY_DEBOUNCE_MS: "10000",
  });
}

test("canário exige simultaneamente instância, telefone e JID autorizados", () => {
  const allowed = config();
  assert.equal(matchesAiWhatsAppCanaryTarget(allowed, {
    instanceId: "private-instance",
    contactPhone: "5511999998888",
    lastKnownJid: "5511999998888@s.whatsapp.net",
  }), true);
  assert.equal(matchesAiWhatsAppCanaryTarget(allowed, {
    instanceId: "clinic-instance",
    contactPhone: "5511999998888",
    lastKnownJid: "5511999998888@s.whatsapp.net",
  }), false);
  assert.equal(matchesAiWhatsAppCanaryTarget(allowed, {
    instanceId: "private-instance",
    contactPhone: "5511988887777",
    lastKnownJid: "5511999998888@s.whatsapp.net",
  }), false);
  assert.equal(matchesAiWhatsAppCanaryTarget(allowed, {
    instanceId: "private-instance",
    contactPhone: "5511999998888",
    lastKnownJid: "5511988887777@s.whatsapp.net",
  }), false);
});

test("configuração inconsistente ou desligada nunca autoriza envio", () => {
  const disabled = readAiWhatsAppCanaryConfig({
    AI_WHATSAPP_CANARY_ENABLED: "false",
    AI_WHATSAPP_CANARY_INSTANCE_ID: "private-instance",
    AI_WHATSAPP_CANARY_PHONE: "11999998888",
  });
  const inconsistent = readAiWhatsAppCanaryConfig({
    AI_WHATSAPP_CANARY_ENABLED: "true",
    AI_WHATSAPP_CANARY_INSTANCE_ID: "private-instance",
    AI_WHATSAPP_CANARY_PHONE: "11999998888",
    AI_WHATSAPP_CANARY_JID: "5511988887777@s.whatsapp.net",
  });
  const target = {
    instanceId: "private-instance",
    contactPhone: "5511999998888",
    lastKnownJid: null,
  };
  assert.equal(disabled.enabled, false);
  assert.equal(inconsistent.enabled, false);
  assert.equal(matchesAiWhatsAppCanaryTarget(disabled, target), false);
  assert.equal(matchesAiWhatsAppCanaryTarget(inconsistent, target), false);
});

test("telefone brasileiro local e internacional convergem para a mesma chave", () => {
  assert.equal(normalizeAiWhatsAppCanaryPhone("(11) 99999-8888"), "5511999998888");
  assert.equal(normalizeAiWhatsAppCanaryPhone("+55 11 99999-8888"), "5511999998888");
});

test("nova entrada ou intervenção humana interrompe a resposta automática", () => {
  assert.equal(aiWhatsAppCanaryActivityBlockReason([
    { fromMe: false, respondedByName: null },
  ]), "newer_inbound");
  assert.equal(aiWhatsAppCanaryActivityBlockReason([
    { fromMe: true, respondedByName: "Vinicius" },
  ]), "human_takeover");
  assert.equal(aiWhatsAppCanaryActivityBlockReason([
    { fromMe: true, respondedByName: AI_WHATSAPP_CANARY_RESPONDER },
  ]), null);
});

test("runtime atual usa Terra com raciocínio baixo e sem temperature", () => {
  assert.equal(AI_CURRENT_MODEL_SPEC, "openai:gpt-5.6-terra");
  const request = buildOpenAiResponsesRequest({
    model: "gpt-5.6-terra",
    instructions: "sistema",
    input: "mensagem",
    temperature: 0.5,
  });
  assert.deepEqual(request.reasoning, { effort: "low", context: "current_turn" });
  assert.deepEqual(request.text, { verbosity: "low" });
  assert.equal(request.store, false);
  assert.equal("temperature" in request, false);
});
