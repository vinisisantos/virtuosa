import assert from "node:assert/strict";
import test, { after, beforeEach } from "node:test";
import { registerHooks } from "node:module";

// The production resolver supports extensionless TypeScript; Node's test runner needs it explicit.
registerHooks({ resolve(specifier, context, next) {
  return next(specifier === "./evaluation-group-notice-config" ? `${specifier}.ts` : specifier, context);
} });
const { evaluationNoticeGroups, fetchEvaluationNoticeGroups } = await import("../src/lib/whatsapp/evaluation-group-directory.ts");
const originalUrl = process.env.EVOLUTION_API_URL;
const originalKey = process.env.EVOLUTION_API_KEY;
beforeEach(() => {
  process.env.EVOLUTION_API_URL = "https://evolution.invalid///";
  process.env.EVOLUTION_API_KEY = "synthetic-not-a-secret";
});
after(() => {
  if (originalUrl === undefined) delete process.env.EVOLUTION_API_URL;
  else process.env.EVOLUTION_API_URL = originalUrl;
  if (originalKey === undefined) delete process.env.EVOLUTION_API_KEY;
  else process.env.EVOLUTION_API_KEY = originalKey;
});

test("descoberta expõe somente grupos de nome exato autorizado e metadados mínimos", () => {
  const groups = evaluationNoticeGroups([
    { id: "120000000000@g.us", subject: "AVALIAÇOES SBC", size: 8, announce: false,
      participants: [{ id: "5511999999999@s.whatsapp.net" }], desc: "Conteúdo privado", owner: "segredo" },
    { id: "120000000001@g.us", subject: "Avaliações SBC antigas" },
    { id: "120000000002@g.us", subject: "AVALIAÇOES OSASCO" },
    { id: "5511999999999@s.whatsapp.net", subject: "AVALIAÇOES SBC" },
    { id: "120000000004@g.us", subject: "AVALIAÇOES SBC\nOutro grupo" },
    null, "AVALIAÇOES SBC", { id: "120000000005@g.us", subject: 1 },
  ]);
  assert.deepEqual(groups, [{ id: "120000000000@g.us", name: "AVALIAÇOES SBC", size: 8, announce: false }]);
  assert.doesNotMatch(JSON.stringify(groups), /participants|owner|desc|5511999999999|Conteúdo/);
});

test("acentos/capitalização não alteram o nome e homônimos preservam seus JIDs distintos", () => {
  const groups = evaluationNoticeGroups([
    { id: "120000000000@g.us", subject: " avaliações sbc ", size: 4, announce: true },
    { id: "120000000001-123@g.us", subject: "AVALIACOES SBC", size: 5 },
    { id: "120000000000@g.us", subject: "Avaliações SBC", size: 4, announce: true },
  ]);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups.map(group => group.id), ["120000000000@g.us", "120000000001-123@g.us"]);
  assert.equal(groups[0].announce, true);
});

test("não aceita payload envelopado, caminho forjado ou metadados inválidos", () => {
  for (const payload of [null, {}, { groups: [] }, "[]"]) {
    assert.throws(() => evaluationNoticeGroups(payload), /Resposta inválida/);
  }
  assert.deepEqual(evaluationNoticeGroups([
    { id: "../120@g.us", subject: "AVALIAÇOES SBC" },
    { id: "120@g.us?next=other", subject: "AVALIAÇOES SBC" },
    { id: "120@g.us", subject: "AVALIAÇOES SBC", size: -1, announce: "true" },
    { id: "121@g.us", subject: "AVALIAÇOES SBC", size: 2.5 },
  ]), [
    { id: "120@g.us", name: "AVALIAÇOES SBC", size: null, announce: false },
    { id: "121@g.us", name: "AVALIAÇOES SBC", size: null, announce: false },
  ]);
});

test("consulta única no provedor não pede participantes, não usa cache e codifica instância", async () => {
  const calls = [];
  const result = await fetchEvaluationNoticeGroups("caixa /?#", async (url, options) => {
    calls.push({ url, options });
    return Response.json([{ id: "120@g.us", subject: "AVALIAÇOES SBC" }]);
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://evolution.invalid/group/fetchAllGroups/caixa%20%2F%3F%23?getParticipants=false");
  assert.equal(calls[0].options.headers.apikey, "synthetic-not-a-secret");
  assert.equal(calls[0].options.cache, "no-store");
  assert.ok(calls[0].options.signal instanceof AbortSignal);
  assert.equal(result.length, 1);
});

test("credencial ausente impede consulta e não produz fallback de outro destino", async () => {
  let calls = 0;
  delete process.env.EVOLUTION_API_KEY;
  await assert.rejects(fetchEvaluationNoticeGroups("caixa", async () => { calls++; }), /não está configurada/);
  assert.equal(calls, 0);
  process.env.EVOLUTION_API_KEY = "synthetic";
  delete process.env.EVOLUTION_API_URL;
  await assert.rejects(fetchEvaluationNoticeGroups("caixa", async () => { calls++; }), /não está configurada/);
  assert.equal(calls, 0);
});

test("falha HTTP/rede não vaza payload, credencial ou URL do provedor", async () => {
  const privateText = "apikey=synthetic-private customer=private";
  await assert.rejects(fetchEvaluationNoticeGroups("caixa", async () => new Response(privateText, { status: 500 })), error => {
    assert.match(error.message, /Evolution não confirmou/);
    assert.doesNotMatch(error.message, /synthetic-private|customer/);
    return true;
  });
  await assert.rejects(fetchEvaluationNoticeGroups("caixa", async () => { throw new Error(privateText); }), error => {
    assert.match(error.message, /Não foi possível consultar o grupo/);
    assert.doesNotMatch(error.message, /synthetic-private|customer/);
    return true;
  });
});
