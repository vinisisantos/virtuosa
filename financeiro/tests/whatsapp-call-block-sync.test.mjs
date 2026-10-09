import assert from "node:assert/strict";
import test, { afterEach, beforeEach, mock } from "node:test";

const CONFIG_KEY = "whatsapp_call_block_settings";
const STATE_KEY = "whatsapp_call_block_sync_state";
const instance = { name: "synthetic-sbc", unit: "SBC", provider: "evolution" };
const currentSettings = {
  groupsIgnore: true,
  alwaysOnline: false,
  readMessages: true,
  readStatus: false,
  syncFullHistory: true,
};
let values, reads, writes, requests, timeouts, readGate, requestOverride;
const previousApiKey = process.env.EVOLUTION_API_KEY;
const previousApiUrl = process.env.EVOLUTION_API_URL;
const previousFetch = globalThis.fetch;

globalThis.prisma = {
  appSetting: {
    findMany: async ({ where, select }) => {
      reads.push("many");
      assert.deepEqual(where, { key: { in: [CONFIG_KEY, STATE_KEY] } });
      assert.deepEqual(select, { key: true, value: true });
      if (readGate) await readGate;
      return [...values].map(([key, value]) => ({ key, value }));
    },
    findUnique: async ({ where }) => {
      reads.push(where.key);
      return values.has(where.key) ? { value: values.get(where.key) } : null;
    },
    upsert: async ({ where, update }) => {
      assert.equal(where.key, STATE_KEY);
      writes.push(JSON.parse(update.value));
      values.set(STATE_KEY, update.value);
    },
  },
};

const { ensureCallRejectApplied } = await import("../src/lib/whatsapp-call-block-sync.ts");
const config = (message = "Envie uma mensagem", enabled = true) => ({ enabled, message, units: ["SBC", "Osasco", "SCS"] });
const storedState = () => JSON.parse(values.get(STATE_KEY));
const throttle = (target = instance, ok = true) => {
  values.set(STATE_KEY, JSON.stringify({
    [target.name]: { at: Date.now(), ok, settingsHash: JSON.stringify([true, "Envie uma mensagem"]) },
  }));
};

beforeEach(() => {
  process.env.EVOLUTION_API_URL = "https://provider.invalid";
  process.env.EVOLUTION_API_KEY = "synthetic-key";
  values = new Map([[CONFIG_KEY, JSON.stringify(config())], [STATE_KEY, "{}"]]);
  reads = []; writes = []; requests = []; timeouts = []; readGate = null; requestOverride = null;
  mock.method(AbortSignal, "timeout", (milliseconds) => {
    timeouts.push(milliseconds);
    return new AbortController().signal;
  });
  globalThis.fetch = async (url, init) => {
    const request = { url: String(url), ...init };
    requests.push(request);
    if (requestOverride) {
      const response = await requestOverride(request);
      if (response) return response;
    }
    if (request.url.includes("/settings/find/")) {
      return Response.json({ ...currentSettings, rejectCall: true, msgCall: "Envie uma mensagem" });
    }
    if (request.url.includes("/settings/set/")) return Response.json({ success: true });
    if (request.url === "https://provider.invalid") return Response.json({ version: "synthetic" });
    throw new Error("Teste não pode consultar qualquer URL externa");
  };
});

afterEach(() => {
  mock.restoreAll();
  globalThis.fetch = previousFetch;
  if (previousApiKey === undefined) delete process.env.EVOLUTION_API_KEY;
  else process.env.EVOLUTION_API_KEY = previousApiKey;
  if (previousApiUrl === undefined) delete process.env.EVOLUTION_API_URL;
  else process.env.EVOLUTION_API_URL = previousApiUrl;
});

test("SBC consulta configurações juntas e não acessa provedor durante throttle", async () => {
  throttle();
  await ensureCallRejectApplied(instance);
  assert.deepEqual(reads, ["many"]);
  assert.equal(requests.length, 0);
  assert.equal(writes.length, 0);
});

test("piloto não altera leitura, timeout ou semântica de outras unidades", async () => {
  const other = { ...instance, name: "synthetic-osasco", unit: "Osasco" };
  await ensureCallRejectApplied(other);
  assert.deepEqual(reads, [CONFIG_KEY, STATE_KEY]);
  assert.equal(requests.length, 4);
  assert.ok(requests.every((request) => !request.signal));
  assert.deepEqual(timeouts, []);
  assert.equal(storedState()[other.name].ok, true);
});

test("rajada na mesma instância compartilha uma sincronização sem TTL", async () => {
  let release;
  readGate = new Promise((resolve) => { release = resolve; });
  const first = ensureCallRejectApplied(instance);
  const requestsInFlight = Array.from({ length: 20 }, () => ensureCallRejectApplied(instance));
  assert.ok(requestsInFlight.every((pending) => pending === first));
  assert.deepEqual(reads, ["many"]);
  release();
  await Promise.all(requestsInFlight);
  assert.equal(requests.length, 4);
  assert.equal(writes.length, 1);

  readGate = null;
  await ensureCallRejectApplied(instance);
  assert.deepEqual(reads, ["many", "many"]);
  assert.equal(requests.length, 4);
});

test("single-flight não agrega nomes de instâncias diferentes", async () => {
  let release;
  readGate = new Promise((resolve) => { release = resolve; });
  const other = { ...instance, name: "synthetic-sbc-other" };
  const first = ensureCallRejectApplied(instance);
  const second = ensureCallRejectApplied(other);
  assert.notEqual(first, second);
  assert.deepEqual(reads, ["many", "many"]);
  release();
  await Promise.all([first, second]);
  assert.deepEqual(requests.filter((request) => request.method === "POST").map((request) => request.url).sort(), [
    "https://provider.invalid/settings/set/synthetic-sbc",
    "https://provider.invalid/settings/set/synthetic-sbc-other",
  ]);
});

test("corpo completo mantém opções do provedor e rede tem orçamento máximo de dez segundos", async () => {
  await ensureCallRejectApplied(instance);
  const sent = JSON.parse(requests.find((request) => request.method === "POST").body);
  assert.deepEqual(sent, { ...currentSettings, rejectCall: true, msgCall: "Envie uma mensagem" });
  assert.deepEqual(timeouts, [3000, 1000, 3000, 3000]);
  assert.ok(requests.every((request) => request.signal instanceof AbortSignal));
  assert.equal(storedState()[instance.name].ok, true);
  assert.equal(storedState()[instance.name].serverVersion, "synthetic");
});

test("configuração nova é relida e desativação explícita preserva outras flags", async () => {
  throttle();
  await ensureCallRejectApplied(instance);
  values.set(CONFIG_KEY, JSON.stringify(config("Outra mensagem", false)));
  requestOverride = async (request) => request.url.includes("/settings/find/")
    ? Response.json({ settings: { instance: { ...currentSettings, rejectCall: false, msgCall: "" } } })
    : null;
  await ensureCallRejectApplied(instance);
  assert.deepEqual(reads, ["many", "many"]);
  const sent = JSON.parse(requests.find((request) => request.method === "POST").body);
  assert.deepEqual(sent, { ...currentSettings, rejectCall: false, msgCall: "" });
  assert.equal(storedState()[instance.name].ok, true);
});

test("falha HTTP na leitura registra diagnóstico sem sobrescrever configurações", async () => {
  requestOverride = async () => new Response("indisponível", { status: 503 });
  await ensureCallRejectApplied(instance);
  assert.equal(requests.length, 1);
  assert.equal(requests.some((request) => request.method === "POST"), false);
  assert.equal(storedState()[instance.name].ok, false);
  assert.match(storedState()[instance.name].error, /HTTP 503/);
  await ensureCallRejectApplied(instance);
  assert.equal(requests.length, 1);
  assert.deepEqual(reads, ["many", "many"]);
});

test("settings incompletas não viram defaults que desligam outras opções", async () => {
  requestOverride = async () => Response.json({ rejectCall: false, groupsIgnore: true });
  await ensureCallRejectApplied(instance);
  assert.equal(requests.length, 1);
  assert.equal(requests.some((request) => request.method === "POST"), false);
  assert.match(storedState()[instance.name].error, /incompleta/);
});

test("timeout de leitura encerra sem set e libera single-flight para o retry posterior", async () => {
  requestOverride = async () => { throw new DOMException("Consulta excedeu o prazo", "TimeoutError"); };
  await ensureCallRejectApplied(instance);
  assert.equal(requests.length, 1);
  assert.match(storedState()[instance.name].error, /excedeu o prazo/);
  const state = storedState();
  state[instance.name].at -= 10 * 60_000 + 1;
  values.set(STATE_KEY, JSON.stringify(state));
  requestOverride = null;
  await ensureCallRejectApplied(instance);
  assert.equal(requests.length, 5);
  assert.equal(storedState()[instance.name].ok, true);
});

test("set com erro mantém diagnóstico e não dispara nova tentativa no mesmo ciclo", async () => {
  requestOverride = async (request) => request.method === "POST"
    ? new Response("synthetic failure", { status: 500 })
    : null;
  await ensureCallRejectApplied(instance);
  assert.equal(requests.length, 3);
  assert.deepEqual(timeouts, [3000, 1000, 3000]);
  assert.equal(storedState()[instance.name].httpStatus, 500);
  assert.equal(storedState()[instance.name].ok, false);
  assert.equal(storedState()[instance.name].error, "synthetic failure");
});

test("WAHA e falta de credencial não consultam banco nem rede", async () => {
  await ensureCallRejectApplied({ ...instance, provider: "waha" });
  delete process.env.EVOLUTION_API_KEY;
  await ensureCallRejectApplied(instance);
  assert.deepEqual(reads, []);
  assert.deepEqual(requests, []);
});
