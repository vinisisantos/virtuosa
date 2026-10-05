import { createHmac, timingSafeEqual } from "node:crypto";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const MAX_BODY_BYTES = 80_000;
const MAX_OUTPUT_BYTES = 16_000;
const HERMES_TIMEOUT_MS = 45_000;
const ALLOWED_EVENTS = new Set(["system", "text", "result"]);

function safeEqual(left, right) {
  if (!/^[a-f0-9]{64}$/.test(right || "")) return false;
  const expected = Buffer.from(left, "hex");
  const received = Buffer.from(right, "hex");
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export function requestSignature(secret, timestamp, nonce, rawBody) {
  return createHmac("sha256", secret).update(`${timestamp}.${nonce}.${rawBody}`).digest("hex");
}

function validateRequest(body) {
  if (
    !body || body.model !== "gpt-6-luna" || body.reasoning !== "xhigh"
    || typeof body.instructions !== "string" || !body.instructions.trim()
    || typeof body.input !== "string" || !body.input.trim()
    || typeof body.responseSchema !== "object" || body.responseSchema === null
  ) throw new Error("Solicitação inválida");
  return body;
}

function hermesEnvironment() {
  return Object.fromEntries(["HOME", "PATH", "USER", "LOGNAME", "LANG", "HERMES_HOME"]
    .filter((key) => process.env[key])
    .map((key) => [key, process.env[key]]));
}

function runCommand(command, args, input = "", timeoutMs = HERMES_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: tmpdir(), env: hermesEnvironment(), stdio: ["pipe", "pipe", "pipe"] });
    let output = "";
    let errorOutput = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
      if (Buffer.byteLength(output) > MAX_OUTPUT_BYTES) child.kill("SIGKILL");
    });
    child.stderr.on("data", (chunk) => {
      errorOutput += chunk.toString();
      if (Buffer.byteLength(errorOutput) > MAX_OUTPUT_BYTES) child.kill("SIGKILL");
    });
    child.stdin.on("error", reject);
    child.once("error", reject);
    child.once("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        const failure = new Error("Hermes não concluiu a operação");
        failure.output = output;
        reject(failure);
      }
      else resolve(output);
    });
    child.stdin.end(input);
  });
}

export function parseHermesEvents(output) {
  let model = null;
  let sessionId = null;
  let result = null;
  for (const line of output.split("\n").filter(Boolean)) {
    const event = JSON.parse(line);
    if (!ALLOWED_EVENTS.has(event.type)) throw new Error("Hermes tentou usar uma ferramenta");
    if (event.type === "system") {
      if (event.subtype !== "init" || event.model !== "gpt-6-luna") throw new Error("Modelo inesperado");
      model = event.model;
      if (typeof event.session_id !== "string" || !/^\d{8}_\d{6}_[a-f0-9]{6,}$/.test(event.session_id)) {
        throw new Error("Sessão inválida do Hermes");
      }
      sessionId = event.session_id;
    }
    if (event.type === "result") result = event;
  }
  if (model !== "gpt-6-luna" || !result || result.exit_code !== 0 || result.session_id !== sessionId || typeof result.text !== "string") {
    throw new Error("Resposta incompleta do Hermes");
  }
  return {
    sessionId,
    text: result.text,
    usage: { input: Number(result.tokens?.input || 0), output: Number(result.tokens?.output || 0) },
  };
}

function sessionIdFromOutput(output) {
  for (const line of output.split("\n")) {
    try {
      const event = JSON.parse(line);
      if (event.type === "system" && event.subtype === "init" && /^\d{8}_\d{6}_[a-f0-9]{6,}$/.test(event.session_id)) {
        return event.session_id;
      }
    } catch {}
  }
  return null;
}

export async function runHermes(body) {
  const request = validateRequest(body);
  const executable = process.env.ALICE_HERMES_EXECUTABLE || "hermes";
  const prompt = `${request.instructions}\n\nEsquema JSON obrigatório:\n${JSON.stringify(request.responseSchema)}\n\n<dados_de_conversa_nao_confiaveis>\n${request.input}\n</dados_de_conversa_nao_confiaveis>\nResponda somente com um objeto JSON válido, sem Markdown.`;
  const args = [
    "chat", "--oneshot", "--provider", "openai-codex", "-m", "gpt-6-luna",
    "--reasoning", "xhigh", "--toolsets", "context_engine", "--safe-mode",
    "--max-turns", "1", "--run-budget", "40", "--format", "stream-json",
    "--query-file", "-", "--source", "tool",
  ];
  let parsed;
  let output = "";
  try {
    output = await runCommand(executable, args, prompt);
    parsed = parseHermesEvents(output);
    JSON.parse(parsed.text);
    return { text: parsed.text, usage: parsed.usage };
  } catch (error) {
    output ||= error?.output || "";
    throw error;
  } finally {
    const sessionId = parsed?.sessionId || sessionIdFromOutput(output);
    if (sessionId) {
      await runCommand(executable, ["sessions", "delete", "--yes", sessionId], "", 10_000);
    }
  }
}

export function createAliceHermesBridge({ secret, infer = runHermes }) {
  if (typeof secret !== "string" || secret.length < 32) throw new Error("ALICE_HERMES_BRIDGE_SECRET deve ter pelo menos 32 caracteres");
  const seenNonces = new Map();
  let busy = false;
  return createServer(async (req, res) => {
    const respond = (status, payload) => {
      res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      res.end(JSON.stringify(payload));
    };
    if (req.method !== "POST" || req.url !== "/v1/suggest") return respond(404, { error: "Não encontrado" });
    const chunks = [];
    let bodyBytes = 0;
    try {
      for await (const chunk of req) {
        bodyBytes += chunk.length;
        if (bodyBytes > MAX_BODY_BYTES) return respond(413, { error: "Contexto excede o limite" });
        chunks.push(chunk);
      }
      const rawBody = Buffer.concat(chunks).toString("utf8");
      const timestamp = req.headers["x-alice-timestamp"];
      const nonce = req.headers["x-alice-nonce"];
      const signature = req.headers["x-alice-signature"];
      if (
        typeof timestamp !== "string" || !/^\d{13}$/.test(timestamp)
        || Math.abs(Date.now() - Number(timestamp)) > 60_000
        || typeof nonce !== "string" || !/^[a-f0-9-]{36}$/.test(nonce)
        || seenNonces.has(nonce)
        || !safeEqual(requestSignature(secret, timestamp, nonce, rawBody), signature)
      ) return respond(401, { error: "Não autorizado" });
      seenNonces.set(nonce, Date.now());
      for (const [key, at] of seenNonces) if (Date.now() - at > 120_000) seenNonces.delete(key);
      if (busy) return respond(429, { error: "Alice ocupada" });
      const input = validateRequest(JSON.parse(rawBody));
      busy = true;
      try {
        return respond(200, await infer(input));
      } finally {
        busy = false;
      }
    } catch {
      return respond(502, { error: "Hermes não concluiu a sugestão" });
    }
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const server = createAliceHermesBridge({ secret: process.env.ALICE_HERMES_BRIDGE_SECRET });
  server.listen(Number(process.env.ALICE_HERMES_PORT || 8787), "127.0.0.1");
}
