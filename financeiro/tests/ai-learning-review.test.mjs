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

test("tela mantém o aprendizado antigo fora da base da Alice até o corte controlado", () => {
  const page = read("src/app/crm/aprendizado-ia/page.tsx");
  const route = read("src/app/api/crm/ai-learning/route.ts");
  const cron = read("src/app/api/cron/ai-learning-observe/route.ts");
  assert.match(page, /Arquivo legado de aprendizado/);
  assert.match(page, /observador antigo continua durante a homologação/);
  assert.match(page, /não são usados pela Alice/);
  assert.match(page, /ADMINISTRADOR/);
  assert.match(route, /requireAiLearningAdmin/);
  assert.doesNotMatch(route, /whatsapp\/send|sendWaha|sendText|Evolution/);
  assert.match(cron, /ALICE_RETIRE_DEEPSEEK_AFTER_CUTOVER === "confirmed"/);
  assert.match(cron, /status: 410/);
  assert.match(cron, /observeAiLearningBatch/);
  const build = read("scripts/vercel-build.mjs");
  assert.match(build, /ALICE_RETIRE_DEEPSEEK_AFTER_CUTOVER !== "confirmed"/);
  assert.match(build, /scripts\/setup-ai-learning-cron\.mjs/);
  assert.match(build, /ALICE_RETIRE_DEEPSEEK_AFTER_CUTOVER === "confirmed"/);
  assert.ok(build.indexOf('run("npm", ["run", "build"])') < build.indexOf("scripts/disable-ai-learning-cron.mjs"));
  assert.match(read("scripts/disable-ai-learning-cron.mjs"), /cron\.unschedule/);
});

test("menu não oferece mais o módulo legado como caminho operacional", () => {
  const sidebar = read("src/components/crm-layout/sidebar.tsx");
  assert.doesNotMatch(sidebar, /\/crm\/aprendizado-ia/);
});
