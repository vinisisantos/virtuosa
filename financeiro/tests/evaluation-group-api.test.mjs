import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
import { registerHooks } from "node:module";
import { NextRequest } from "next/server.js";
import { EVALUATION_GROUP_INSTANCE_ID, EVALUATION_GROUP_SETTING_KEY } from "../src/lib/whatsapp/evaluation-group-notice-config.ts";

const substitutes = {
  "@/lib/whatsapp/instance-resolver": "export async function getInstancesForRequest(req) { globalThis.groupApiCalls.push({ kind: 'access', url: req.url }); return { instances: globalThis.groupApiInstances }; }",
  "@/lib/whatsapp/evaluation-group-directory": "export async function fetchEvaluationNoticeGroups(name) { globalThis.groupApiCalls.push({ kind: 'provider', name }); if (globalThis.groupApiProviderError) throw globalThis.groupApiProviderError; return globalThis.groupApiGroups; }",
};
registerHooks({ resolve(specifier, context, next) {
  if (substitutes[specifier]) return { url: `data:text/javascript,${encodeURIComponent(substitutes[specifier])}`, shortCircuit: true };
  return next(specifier === "next/server" ? "next/server.js" : specifier, context);
} });
let setting, notices;
const db = {
  appSetting: {
    findUnique: async args => { globalThis.groupApiCalls.push({ kind: "setting-read", args }); return setting; },
    upsert: async args => { globalThis.groupApiCalls.push({ kind: "setting-write", args }); setting = { value: args.update.value }; return setting; },
  },
  whatsAppEvaluationGroupNotice: {
    findMany: async args => { globalThis.groupApiCalls.push({ kind: "history", args }); return notices; },
  },
  activityLog: { create: async args => { globalThis.groupApiCalls.push({ kind: "audit", args }); return {}; } },
  $executeRaw: async (...args) => { globalThis.groupApiCalls.push({ kind: "lock", args }); return 1; },
  $transaction: async task => { globalThis.groupApiCalls.push({ kind: "transaction" }); return task(db); },
};
globalThis.prisma = db;
const { GET, POST } = await import("../src/app/api/whatsapp/evaluation-group/route.ts");
const configured = overrides => ({ enabled: true, instanceId: EVALUATION_GROUP_INSTANCE_ID, groupJid: "120000000000@g.us",
  groupName: "AVALIAÇOES SBC", activatedAt: "2026-10-08T12:00:00.000Z", approvedBy: "admin", ...overrides });
beforeEach(() => {
  setting = null; notices = [];
  globalThis.groupApiCalls = [];
  globalThis.groupApiProviderError = null;
  globalThis.groupApiInstances = [{ id: EVALUATION_GROUP_INSTANCE_ID, unit: "SBC", name: "synthetic-paloma", canView: true, canReply: true, status: "connected", provider: "evolution" }];
  globalThis.groupApiGroups = [{ id: "120000000000@g.us", name: "AVALIAÇOES SBC", size: 8, announce: false }];
});
function request(method = "GET", body, options = {}) {
  const query = options.query ?? `?unit=SBC&targetInstanceId=${EVALUATION_GROUP_INSTANCE_ID}`;
  const headers = { "x-user-id": "admin", "x-user-role": "ADMINISTRADOR", "x-user-name": "Administrador Teste", ...options.headers };
  for (const [key, value] of Object.entries(headers)) if (value === null) delete headers[key];
  return new NextRequest(`http://localhost/api/whatsapp/evaluation-group${query}`, {
    method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
const post = (body, options) => POST(request("POST", body, options));
const calls = kind => globalThis.groupApiCalls.filter(call => call.kind === kind);

test("GET exige autenticação, seleção explícita SBC/Paloma e acesso real à instância", async () => {
  for (const options of [{ headers: { "x-user-id": null } }, { query: "?unit=SBC" },
    { query: `?unit=Osasco&targetInstanceId=${EVALUATION_GROUP_INSTANCE_ID}` },
    { query: "?unit=SBC&targetInstanceId=outra-caixa" }]) {
    assert.ok([401, 403].includes((await GET(request("GET", undefined, options))).status));
  }
  assert.equal(globalThis.groupApiCalls.length, 0, "não consulta antes de validar o escopo explícito");
  for (const instances of [[], [{ ...globalThis.groupApiInstances[0], canView: false }], [{ ...globalThis.groupApiInstances[0], unit: "Osasco" }]]) {
    globalThis.groupApiInstances = instances;
    assert.equal((await GET(request())).status, 403);
  }
  assert.equal(calls("setting-read").length, 0);
  assert.equal(calls("history").length, 0);
});

test("GET de viewer usa duas leituras limitadas no banco e nenhuma consulta Evolution", async () => {
  globalThis.groupApiInstances[0].canReply = false;
  notices = [{ id: "notice", clientName: "Cliente Exemplo" }];
  const response = await GET(request("GET", undefined, { headers: { "x-user-role": "CONSULTORA" } }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  assert.deepEqual(await response.json(), { config: null, notices, canManage: false, connected: true });
  assert.equal(calls("provider").length, 0);
  assert.equal(calls("setting-read").length, 1);
  const history = calls("history")[0].args;
  assert.deepEqual(history.where, { instanceId: EVALUATION_GROUP_INSTANCE_ID });
  assert.equal(history.take, 20);
  assert.deepEqual(history.orderBy, [{ createdAt: "desc" }, { id: "desc" }]);
  assert.equal(history.select.groupJid, undefined);
  assert.equal(history.select.providerMessageId, undefined);
});

test("POST exige administrador e canReply, mesmo quando papel de membro pode gerenciar", async () => {
  globalThis.groupApiInstances[0].canManage = true;
  for (const role of ["MARKETING", "CONSULTORA", "MANAGER", "OWNER"]) {
    assert.equal((await post({ action: "discover" }, { headers: { "x-user-role": role } })).status, 403);
  }
  globalThis.groupApiInstances[0].canReply = false;
  assert.equal((await post({ action: "discover" })).status, 403);
  assert.equal(calls("provider").length, 0);
  assert.equal(calls("transaction").length, 0);
});

test("descoberta é ação explícita sem gravar, sem envio e com no-store", async () => {
  const response = await post({ action: "discover" });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  assert.deepEqual((await response.json()).groups, globalThis.groupApiGroups);
  assert.deepEqual(calls("provider"), [{ kind: "provider", name: "synthetic-paloma" }]);
  assert.equal(calls("transaction").length, 0);
  assert.equal(calls("setting-write").length, 0);
});

test("corpo/ação/ativação inválidos não consultam provedor nem gravam", async () => {
  for (const body of [null, [], { action: "send" }, { action: "configure", enabled: "true" },
    { action: "configure", enabled: true, groupJid: "120000000000@g.us" },
    { action: "configure", enabled: true, confirmTeamAccess: true, groupJid: "5511999999999@s.whatsapp.net" }]) {
    assert.equal((await post(body)).status, 400);
  }
  assert.equal(calls("provider").length, 0);
  assert.equal(calls("transaction").length, 0);
});

test("JSON malformado retorna erro de entrada sem consultar Evolution nem gravar", async () => {
  const req = new NextRequest(`http://localhost/api/whatsapp/evaluation-group?unit=SBC&targetInstanceId=${EVALUATION_GROUP_INSTANCE_ID}`, {
    method: "POST", headers: { "x-user-id": "admin", "x-user-role": "ADMINISTRADOR" }, body: "{invalid-json",
  });
  assert.equal((await POST(req)).status, 400);
  assert.equal(calls("provider").length, 0);
  assert.equal(calls("transaction").length, 0);
});

test("WAHA/desconectado bloqueiam descoberta e ativação antes do provedor", async () => {
  for (const changed of [{ provider: "waha" }, { provider: "unsupported-provider" }, { status: "disconnected" }]) {
    Object.assign(globalThis.groupApiInstances[0], { provider: "evolution", status: "connected" }, changed);
    assert.equal((await post({ action: "discover" })).status, 409);
    assert.equal((await post({ action: "configure", enabled: true, confirmTeamAccess: true, groupJid: "120000000000@g.us" })).status, 409);
  }
  assert.equal(calls("provider").length, 0);
  assert.equal(calls("setting-write").length, 0);
});

test("ativação revalida JID no provedor, não confia no nome/JID informado pelo navegador", async () => {
  const response = await post({ action: "configure", enabled: true, confirmTeamAccess: true, groupJid: "120000000999@g.us", groupName: "AVALIAÇOES SBC" });
  assert.equal(response.status, 409);
  assert.equal(calls("provider").length, 1);
  assert.equal(calls("transaction").length, 0);
});

test("ativação fixa destino/escopo, audita consentimento e serializa alterações", async () => {
  const before = Date.now();
  const response = await post({ action: "configure", enabled: true, confirmTeamAccess: true,
    groupJid: "120000000000@g.us", instanceId: "forged", groupName: "Outro", activatedAt: "2000-01-01" });
  assert.equal(response.status, 200);
  const { config, success } = await response.json();
  assert.equal(success, true);
  assert.equal(config.instanceId, EVALUATION_GROUP_INSTANCE_ID);
  assert.equal(config.groupName, "AVALIAÇOES SBC");
  assert.equal(config.approvedBy, "admin");
  assert.ok(Date.parse(config.activatedAt) >= before);
  assert.equal(calls("transaction").length, 1);
  assert.equal(calls("lock").length, 1);
  assert.equal(calls("setting-write")[0].args.where.key, EVALUATION_GROUP_SETTING_KEY);
  assert.equal(calls("audit")[0].args.data.action, "evaluation_group_enabled");
  assert.equal(JSON.parse(calls("audit")[0].args.data.metadata).confirmTeamAccess, true);
  const kinds = globalThis.groupApiCalls.map(call => call.kind);
  assert.ok(kinds.indexOf("provider") < kinds.indexOf("transaction"), "HTTP fora da transação");
  assert.ok(kinds.indexOf("lock") < kinds.indexOf("setting-read"));
});

test("salvar mesmo destino ativo preserva marco; reativar cria corte novo sem retroatividade", async () => {
  setting = { value: JSON.stringify(configured()) };
  let result = await (await post({ action: "configure", enabled: true, confirmTeamAccess: true, groupJid: "120000000000@g.us" })).json();
  assert.equal(result.config.activatedAt, "2026-10-08T12:00:00.000Z");
  setting = { value: JSON.stringify(configured({ enabled: false })) };
  result = await (await post({ action: "configure", enabled: true, confirmTeamAccess: true, groupJid: "120000000000@g.us" })).json();
  assert.notEqual(result.config.activatedAt, "2026-10-08T12:00:00.000Z");
});

test("pausa funciona desconectado sem consulta Evolution e preserva destino e corte", async () => {
  setting = { value: JSON.stringify(configured()) };
  globalThis.groupApiInstances[0].status = "disconnected";
  const response = await post({ action: "configure", enabled: false, groupJid: "forged" });
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).config, configured({ enabled: false }));
  assert.equal(calls("provider").length, 0);
  assert.equal(calls("audit")[0].args.data.action, "evaluation_group_paused");
});

test('configurar não pode habilitar confirmação pelo navegador; corte aprovado é preservado', async () => {
  let result = await (await post({ action: 'configure', enabled: true, confirmTeamAccess: true,
    groupJid: '120000000000@g.us', confirmationsActivatedAt: '2000-01-01' })).json();
  assert.equal(result.config.confirmationsActivatedAt, undefined);
  const cutoff = '2026-10-09T12:00:00.000Z';
  setting = { value: JSON.stringify(configured({ confirmationsActivatedAt: cutoff })) };
  result = await (await post({ action: 'configure', enabled: true, confirmTeamAccess: true, groupJid: '120000000000@g.us' })).json();
  assert.equal(result.config.confirmationsActivatedAt, cutoff);
  result = await (await post({ action: 'configure', enabled: false })).json();
  assert.equal(result.config.confirmationsActivatedAt, cutoff);
  result = await (await post({ action: 'configure', enabled: true, confirmTeamAccess: true, groupJid: '120000000000@g.us' })).json();
  assert.ok(Date.parse(result.config.confirmationsActivatedAt) > Date.parse(cutoff));
});

test("pausar configuração ausente não fabrica grupo nem grava histórico", async () => {
  const response = await post({ action: "configure", enabled: false });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { config: null, success: true });
  assert.equal(calls("setting-write").length, 0);
  assert.equal(calls("audit").length, 0);
});

test("falha inesperada é sanitizada e não altera configuração existente", async () => {
  const original = JSON.stringify(configured());
  setting = { value: original };
  globalThis.groupApiProviderError = new Error("synthetic-private-token customer-health-payload");
  const response = await post({ action: "configure", enabled: true, confirmTeamAccess: true, groupJid: "120000000000@g.us" });
  assert.equal(response.status, 500);
  assert.doesNotMatch(await response.text(), /synthetic-private|health-payload/);
  assert.equal(setting.value, original);
  assert.equal(calls("setting-write").length, 0);
});
