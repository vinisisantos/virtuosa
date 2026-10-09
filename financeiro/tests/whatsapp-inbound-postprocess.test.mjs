import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

globalThis.prisma = {};
const {
  compactInboundPostProcessPayload,
  inboundPostProcessDispatchCommand,
} = await import("../src/lib/whatsapp/inbound-postprocess-queue.ts");

test("compacta o evento sem persistir base64 ou miniaturas pesadas", () => {
  const payload = compactInboundPostProcessPayload({
    message: {
      key: { id: "message-1", remoteJid: "5511999999999@s.whatsapp.net" },
      message: {
        imageMessage: {
          caption: "Olá",
          base64: "segredo-pesado",
          jpegThumbnail: "miniatura-pesada",
          url: "https://media.example/image",
        },
      },
    },
    webhook: { event: "messages.upsert", type: "notify", data: { type: "notify" } },
    conversationWasCreated: true,
    receivedAt: new Date("2026-09-22T12:00:00.000Z"),
  });

  assert.equal(payload.message.key.id, "message-1");
  assert.equal(payload.message.message.imageMessage.caption, "Olá");
  assert.equal(payload.message.message.imageMessage.url, "https://media.example/image");
  assert.equal("base64" in payload.message.message.imageMessage, false);
  assert.equal("jpegThumbnail" in payload.message.message.imageMessage, false);
  assert.equal(payload.webhook.event, "messages.upsert");
  assert.equal(payload.conversationWasCreated, true);
});

test("agendador só chama o worker com fila vencida e sem outro worker ativo", () => {
  const command = inboundPostProcessDispatchCommand("secret'quote");

  assert.match(command, /status = 'pending'/);
  assert.match(command, /"availableAt" <= now\(\)/);
  assert.match(command, /NOT EXISTS[\s\S]+status = 'processing'/);
  assert.match(command, /internal\.whatsapp-postprocess/);
  assert.match(command, /Bearer secret''quote/);
});

test("SQL do cron dispara somente com trabalho recuperável e respeita claims inline/worker", async () => {
  const pg = new PGlite();
  try {
    await pg.exec(`
      CREATE SCHEMA net;
      CREATE TABLE net.requests (id bigserial PRIMARY KEY, url text, headers jsonb, body jsonb);
      CREATE FUNCTION net.http_post(url text, headers jsonb, body jsonb, timeout_milliseconds integer)
      RETURNS bigint LANGUAGE sql AS $$
        INSERT INTO net.requests(url, headers, body) VALUES ($1, $2, $3) RETURNING id
      $$;
      CREATE TABLE "WhatsAppInboundPostProcessJob" (
        id text PRIMARY KEY, status text, "availableAt" timestamp DEFAULT NOW(),
        attempts integer DEFAULT 1, "claimedAt" timestamp
      );
      CREATE TABLE "WhatsAppStatusReceipt" (
        id text PRIMARY KEY, state text, "availableAt" timestamp DEFAULT NOW(),
        attempts integer DEFAULT 1, "claimedAt" timestamp, "claimToken" text
      );
    `);
    const command = inboundPostProcessDispatchCommand("secret'quote");
    const dispatch = async (expected) => {
      await pg.exec("TRUNCATE net.requests;");
      await pg.exec(command);
      const requests = (await pg.query("SELECT * FROM net.requests")).rows;
      assert.equal(requests.length, expected);
      if (expected) {
        assert.equal(requests[0].url, "https://clinicasgestao.com.br/api/whatsapp/webhook");
        assert.equal(requests[0].headers.Authorization, "Bearer secret'quote");
        assert.deepEqual(requests[0].body, { event: "internal.whatsapp-postprocess" });
      }
    };
    await dispatch(0);
    await pg.exec('INSERT INTO "WhatsAppStatusReceipt" (id,state) VALUES (\'due\',\'pending\');');
    await dispatch(1);
    await pg.exec(`INSERT INTO "WhatsAppStatusReceipt" (id,state,"claimedAt","claimToken")
      VALUES ('inline','processing',NOW(),'inline:lease');`);
    await dispatch(1);
    await pg.exec(`INSERT INTO "WhatsAppStatusReceipt" (id,state,"claimedAt","claimToken")
      VALUES ('worker','processing',NOW(),'worker:lease');`);
    await dispatch(0);
    await pg.exec(`UPDATE "WhatsAppStatusReceipt" SET "claimedAt"=NOW()-interval '3 minutes' WHERE id='worker';`);
    await dispatch(1);
    await pg.exec(`TRUNCATE "WhatsAppStatusReceipt";
      INSERT INTO "WhatsAppStatusReceipt" (id,state,"claimedAt","claimToken")
      VALUES ('stale-inline','processing',NOW()-interval '3 minutes','inline:lease');`);
    await dispatch(1);
    await pg.exec(`UPDATE "WhatsAppStatusReceipt" SET "claimedAt"=NOW();`);
    await dispatch(0);
    await pg.exec(`TRUNCATE "WhatsAppStatusReceipt";
      INSERT INTO "WhatsAppStatusReceipt" (id,state,attempts) VALUES ('exhausted','pending',6);`);
    await dispatch(0);
    await pg.exec(`UPDATE "WhatsAppStatusReceipt" SET attempts=1,"availableAt"=NOW()+interval '1 minute';`);
    await dispatch(0);
    await pg.exec(`UPDATE "WhatsAppStatusReceipt" SET "availableAt"=NOW()-interval '1 second';
      INSERT INTO "WhatsAppInboundPostProcessJob" (id,status,"claimedAt") VALUES ('inbound','processing',NOW());`);
    await dispatch(0);
    await pg.exec(`UPDATE "WhatsAppInboundPostProcessJob" SET "claimedAt"=NOW()-interval '3 minutes';`);
    await dispatch(1);
  } finally {
    await pg.close();
  }
});

test("migração é aditiva, idempotente e não cria backfill histórico", async () => {
  const migration = await readFile(
    new URL("../prisma/migrations/20260922153000_whatsapp_inbound_postprocess_queue/migration.sql", import.meta.url),
    "utf8",
  );

  assert.match(migration, /CREATE TABLE IF NOT EXISTS/);
  assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS/);
  assert.doesNotMatch(migration, /INSERT\s+INTO\s+"WhatsAppInboundPostProcessJob"/i);
});

test("webhook persiste antes da resolução externa e ignora a mensagem atual nas contagens", async () => {
  const source = await readFile(
    new URL("../src/app/api/whatsapp/webhook/route.ts", import.meta.url),
    "utf8",
  );

  const fastPersist = source.indexOf("persistIncomingMessageFast({");
  const campaignLookup = source.indexOf("resolveCampaignFromAdId(adId, leadUnit)");
  assert.ok(fastPersist > 0 && campaignLookup > fastPersist);
  assert.match(source, /messageId:\s*\{\s*not:\s*messageId\s*\}/);
  assert.match(source, /phase:\s*"postprocess"/);
  assert.match(source, /receivedToPersistMs/);
});
