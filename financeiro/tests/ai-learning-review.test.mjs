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

test("tela mantém o aprendizado antigo como arquivo e fora da base da Alice", () => {
  const page = read("src/app/crm/aprendizado-ia/page.tsx");
  const route = read("src/app/api/crm/ai-learning/route.ts");
  const cron = read("src/app/api/cron/ai-learning-observe/route.ts");
  assert.match(page, /Arquivo legado de aprendizado/);
  assert.match(page, /observador automático antigo foi desativado/);
  assert.match(page, /não são usados pela Alice/);
  assert.match(page, /ADMINISTRADOR/);
  assert.match(route, /requireAiLearningAdmin/);
  assert.doesNotMatch(route, /whatsapp\/send|sendWaha|sendText|Evolution/);
  assert.match(cron, /status: 410/);
  assert.doesNotMatch(cron, /observeAiLearningBatch/);
});

test("menu não oferece mais o módulo legado como caminho operacional", () => {
  const sidebar = read("src/components/crm-layout/sidebar.tsx");
  assert.doesNotMatch(sidebar, /\/crm\/aprendizado-ia/);
});
