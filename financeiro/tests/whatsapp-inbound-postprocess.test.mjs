import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import {
  compactInboundPostProcessPayload,
  inboundPostProcessDispatchCommand,
} from "../src/lib/whatsapp/inbound-postprocess-queue.ts";

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
