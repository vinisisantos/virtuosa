import assert from "node:assert/strict";
import { test } from "node:test";
import { buildClaudeRequest, generateClaudeReply } from "#lib/ai-assistant/claude-provider";
globalThis.prisma = {};
const { claudeMonthlyReservation } = await import("#lib/ai-assistant/claude-budget");

const context = { BASE_ALICE: { documents: [{ source: "manual", text: "Avaliação gratuita" }] }, UNIDADE: "SBC", CONTATO: { name: "Cliente", phone: "5511999999999" }, CONVERSA: [{ role: "cliente", text: "Olá" }] };

test("Claude recebe a mesma base sem identificadores e com schema suportado", () => {
  const request = buildClaudeRequest(context);
  assert.equal(request.model, "claude-sonnet-4-6");
  assert.match(request.system, /Avaliação gratuita/);
  assert.doesNotMatch(JSON.stringify(request), /5511999999999|Cliente/);
  assert.doesNotMatch(JSON.stringify(request.output_config), /maxLength|minLength|maxItems/);
  assert.ok(claudeMonthlyReservation(context) > 0);
  assert.throws(() => claudeMonthlyReservation({ text: "x".repeat(100_000) }), /grande demais/);
});

test("Claude devolve sugestão validada sem usar rede real", async () => {
  const previousKey = process.env.ANTHROPIC_API_KEY;
  const previousFetch = globalThis.fetch;
  process.env.ANTHROPIC_API_KEY = "chave-ficticia";
  let requestCount = 0;
  globalThis.fetch = async (url, options) => {
    requestCount++;
    assert.equal(url, "https://api.anthropic.com/v1/messages");
    assert.equal(options.headers["x-api-key"], "chave-ficticia");
    return new Response(JSON.stringify({ content: [{ type: "text", text: JSON.stringify({ response: "Olá! Como posso ajudar?", confidence: "high", needsHuman: false, usedKnowledge: [] }) }], usage: { input_tokens: 20, output_tokens: 10 } }));
  };
  try {
    const usage = { input: 0, output: 0 };
    assert.equal((await generateClaudeReply(context, usage)).response, "Olá! Como posso ajudar?");
    assert.deepEqual(usage, { input: 20, output: 10 });
    assert.equal(requestCount, 1);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = previousKey;
  }
});

test("falha do provedor não expõe detalhes nem credenciais", async () => {
  const previousKey = process.env.ANTHROPIC_API_KEY;
  const previousFetch = globalThis.fetch;
  process.env.ANTHROPIC_API_KEY = "segredo-ficticio";
  globalThis.fetch = async () => new Response("detalhe com segredo-ficticio", { status: 401 });
  try {
    await assert.rejects(generateClaudeReply(context, { input: 0, output: 0 }), (error) => {
      assert.doesNotMatch(error.message, /segredo-ficticio/);
      return true;
    });
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = previousKey;
  }
});
