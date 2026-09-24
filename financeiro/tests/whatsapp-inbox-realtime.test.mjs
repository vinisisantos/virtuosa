import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import {
  broadcastInboxRealtimeChange,
  inboxRealtimePayload,
  inboxRealtimePublicConfig,
  inboxRealtimeTopic,
} from "../src/lib/whatsapp/inbox-realtime.ts";

function withRealtimeEnv(callback) {
  const previous = {
    topic: process.env.WHATSAPP_REALTIME_TOPIC_SECRET,
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_PUBLISHABLE_KEY,
  };
  process.env.WHATSAPP_REALTIME_TOPIC_SECRET = "segredo-de-teste";
  process.env.SUPABASE_URL = "https://project-ref.supabase.co";
  process.env.SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";
  try {
    return callback();
  } finally {
    if (previous.topic === undefined) delete process.env.WHATSAPP_REALTIME_TOPIC_SECRET;
    else process.env.WHATSAPP_REALTIME_TOPIC_SECRET = previous.topic;
    if (previous.url === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = previous.url;
    if (previous.key === undefined) delete process.env.SUPABASE_PUBLISHABLE_KEY;
    else process.env.SUPABASE_PUBLISHABLE_KEY = previous.key;
  }
}

test("topic realtime é opaco, determinístico e isolado por instância", () => {
  withRealtimeEnv(() => {
    const first = inboxRealtimeTopic("instance-a");
    const repeated = inboxRealtimeTopic("instance-a");
    const other = inboxRealtimeTopic("instance-b");

    assert.equal(first, repeated);
    assert.notEqual(first, other);
    assert.doesNotMatch(first, /instance-a/);
    assert.match(first, /^whatsapp-inbox:[a-f0-9]{64}$/);
  });
});

test("payload do broadcast não transporta conteúdo nem dados do contato", () => {
  const payload = inboxRealtimePayload({
    conversationId: "conversation-1",
    messageId: "message-1",
    kind: "message",
  });

  assert.deepEqual(Object.keys(payload).sort(), ["conversationId", "kind", "messageId", "occurredAt"]);
  assert.equal(JSON.stringify(payload).includes("phone"), false);
  assert.equal(JSON.stringify(payload).includes("body"), false);
  assert.equal(JSON.stringify(payload).includes("name"), false);
});

test("configuração pública exige HTTPS e a chave pública", () => {
  withRealtimeEnv(() => {
    assert.deepEqual(inboxRealtimePublicConfig(), {
      url: "https://project-ref.supabase.co",
      publishableKey: "sb_publishable_test",
    });
    process.env.SUPABASE_URL = "http://project-ref.supabase.co";
    assert.equal(inboxRealtimePublicConfig(), null);
  });
});

test("falha de broadcast não interrompe webhook ou envio", async () => {
  await withRealtimeEnv(async () => {
    const previousWarn = console.warn;
    console.warn = () => {};
    try {
      const result = await broadcastInboxRealtimeChange({
        instanceId: "instance-a",
        conversationId: "conversation-1",
        messageId: "message-1",
        kind: "message",
      }, async () => {
        throw new Error("realtime indisponível");
      });
      assert.equal(result, false);
    } finally {
      console.warn = previousWarn;
    }
  });
});

test("broadcast usa REST com timeout sem consumir conexão do Postgres", async () => {
  await withRealtimeEnv(async () => {
    let captured;
    const result = await broadcastInboxRealtimeChange({
      instanceId: "instance-a",
      conversationId: "conversation-1",
      messageId: "message-1",
      kind: "message",
    }, async (url, init) => {
      captured = { url: String(url), init };
      return new Response(null, { status: 202 });
    });

    assert.equal(result, true);
    assert.match(captured.url, /\/realtime\/v1\/api\/broadcast\//);
    assert.equal(captured.init.method, "POST");
    assert.equal(captured.init.headers.apikey, "sb_publishable_test");
    assert.equal(JSON.parse(captured.init.body).conversationId, "conversation-1");
    assert.ok(captured.init.signal instanceof AbortSignal);
  });
});

test("endpoint deriva tópicos das instâncias autorizadas", async () => {
  const source = await readFile(
    new URL("../src/app/api/whatsapp/realtime/route.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /getInstancesForRequest\(req\)/);
  assert.match(source, /instances[\s\S]+inboxRealtimeTopic\(instance\.id\)/);
  assert.match(source, /Cache-Control["']:\s*["']private, no-store/);
});

test("Inbox assina Broadcast e preserva polling de 30 segundos", async () => {
  const [source, utils] = await Promise.all([
    readFile(new URL("../src/app/crm/inbox/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/lib/whatsapp/inbox-utils.ts", import.meta.url), "utf8"),
  ]);

  assert.match(source, /\.on\("broadcast",\s*\{ event: config\.event \}/);
  assert.match(source, /removeAllChannels\(\)/);
  assert.match(source, /useVisiblePolling\(refreshVisibleInbox, INBOX_POLL_INTERVAL_MS/);
  assert.match(utils, /INBOX_POLL_INTERVAL_MS\s*=\s*30000/);
});
