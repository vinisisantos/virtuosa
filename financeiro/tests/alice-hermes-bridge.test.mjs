import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { request as httpRequest } from "node:http";
import test from "node:test";
import { createAliceHermesBridge, parseHermesEvents, requestSignature } from "../infra/alice-hermes-bridge.mjs";

const secret = "alice-local-test-secret-with-at-least-32-characters";
const request = {
  model: "gpt-6-luna",
  reasoning: "xhigh",
  instructions: "Teste fictício, sem cliente real",
  input: '{"CONVERSA":[{"role":"cliente","text":"Olá"}]}',
  responseSchema: { type: "object" },
};

test("ponte exige assinatura, bloqueia repetição e nunca chama Hermes sem autenticação", async () => {
  let calls = 0;
  const server = createAliceHermesBridge({ secret, infer: async () => {
    calls += 1;
    return { text: '{"response":"Olá"}', usage: { input: 10, output: 5 } };
  } });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${server.address().port}/v1/suggest`;
  try {
    const body = JSON.stringify(request);
    const timestamp = String(Date.now());
    const nonce = randomUUID();
    const headers = {
      "X-Alice-Timestamp": timestamp,
      "X-Alice-Nonce": nonce,
      "X-Alice-Signature": requestSignature(secret, timestamp, nonce, body),
    };
    assert.equal((await fetch(url, { method: "POST", body })).status, 401);
    const valid = await fetch(url, { method: "POST", body, headers });
    assert.equal(valid.status, 200);
    assert.deepEqual(await valid.json(), { text: '{"response":"Olá"}', usage: { input: 10, output: 5 } });
    assert.equal((await fetch(url, { method: "POST", body, headers })).status, 401);
    assert.equal(calls, 1);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("eventos de ferramenta ou modelo diferente são recusados", () => {
  const sessionId = "20261005_151143_4446ce";
  const init = JSON.stringify({ type: "system", subtype: "init", model: "gpt-6-luna", session_id: sessionId });
  const tool = JSON.stringify({ type: "tool_call", name: "shell" });
  const result = JSON.stringify({ type: "result", session_id: sessionId, exit_code: 0, text: "{}", tokens: { input: 1, output: 1 } });
  assert.throws(() => parseHermesEvents(`${init}\n${tool}\n${result}`), /ferramenta/);
  assert.deepEqual(parseHermesEvents(`${init}\n${result}`), {
    sessionId, text: "{}", usage: { input: 1, output: 1 },
  });
});

test("assinatura aceita JSON UTF-8 mesmo quando o caractere chega em partes", async () => {
  const server = createAliceHermesBridge({ secret, infer: async () => ({ text: "{}", usage: { input: 1, output: 1 } }) });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const body = JSON.stringify({ ...request, input: "olá" });
    const bytes = Buffer.from(body);
    const split = bytes.indexOf(Buffer.from("á")) + 1;
    const timestamp = String(Date.now());
    const nonce = randomUUID();
    const response = await new Promise((resolve, reject) => {
      const req = httpRequest({ hostname: "127.0.0.1", port: server.address().port, path: "/v1/suggest", method: "POST", headers: {
        "X-Alice-Timestamp": timestamp,
        "X-Alice-Nonce": nonce,
        "X-Alice-Signature": requestSignature(secret, timestamp, nonce, body),
      } }, (res) => resolve(res));
      req.on("error", reject);
      req.write(bytes.subarray(0, split));
      req.end(bytes.subarray(split));
    });
    assert.equal(response.statusCode, 200);
    response.resume();
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
