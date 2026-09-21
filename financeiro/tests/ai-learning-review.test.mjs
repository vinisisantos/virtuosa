import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validateAiLearningReviewInput } from "#lib/ai-learning/review-policy";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

test("aprovação exige confirmação humana e clínica quando aplicável", () => {
  assert.throws(() => validateAiLearningReviewInput({ action: "approve" }, false));
  assert.equal(validateAiLearningReviewInput({ action: "approve", confirmed: true }, false), "approve");
  assert.throws(() => validateAiLearningReviewInput({ action: "approve", confirmed: true }, true));
  assert.equal(validateAiLearningReviewInput({ action: "approve", confirmed: true, clinicalConfirmed: true }, true), "approve");
});

test("tela e API deixam explícito que o aprendizado não atende clientes", () => {
  const page = read("src/app/crm/aprendizado-ia/page.tsx");
  const route = read("src/app/api/crm/ai-learning/route.ts");
  assert.match(page, /Nada aqui responde clientes/);
  assert.match(page, /Modo sombra ativo/);
  assert.match(page, /ADMINISTRADOR/);
  assert.match(route, /requireAiLearningAdmin/);
  assert.doesNotMatch(route, /whatsapp\/send|sendWaha|sendText|Evolution/);
});

test("menu expõe revisão somente no bloco administrativo", () => {
  const sidebar = read("src/components/crm-layout/sidebar.tsx");
  assert.match(sidebar, /userRole === "ADMINISTRADOR"[\s\S]*\/crm\/aprendizado-ia/);
});
