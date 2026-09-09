-- Executar separadamente do ALTER TABLE: CONCURRENTLY não aceita transação.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "WhatsAppMessage_dispatch_conversation_timestamp_idx"
ON "WhatsAppMessage" ("conversationId", "timestamp" DESC, "id" DESC)
WHERE "dispatchMetadata" IS NOT NULL AND "fromMe" = true;
