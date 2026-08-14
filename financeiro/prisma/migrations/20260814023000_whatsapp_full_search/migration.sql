-- Busca completa do inbox. A extensão e todos os índices são aditivos e
-- idempotentes. CONCURRENTLY evita bloquear as escritas do webhook enquanto
-- o índice de mensagens é construído em produção.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX CONCURRENTLY IF NOT EXISTS "WhatsAppContact_name_trgm_idx"
  ON "WhatsAppContact" USING GIN (LOWER(COALESCE("name", '')) gin_trgm_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS "WhatsAppContact_phone_digits_trgm_idx"
  ON "WhatsAppContact" USING GIN (
    REGEXP_REPLACE(COALESCE("phone", ''), '[^0-9]', '', 'g') gin_trgm_ops
  );

CREATE INDEX CONCURRENTLY IF NOT EXISTS "WhatsAppConversation_assignedToName_trgm_idx"
  ON "WhatsAppConversation" USING GIN (
    LOWER(COALESCE("assignedToName", '')) gin_trgm_ops
  );

CREATE INDEX CONCURRENTLY IF NOT EXISTS "WhatsAppMessage_body_trgm_idx"
  ON "WhatsAppMessage" USING GIN (LOWER(COALESCE("body", '')) gin_trgm_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS "WhatsAppConversationInternalNote_content_trgm_idx"
  ON "WhatsAppConversationInternalNote" USING GIN (
    LOWER(COALESCE("content", '')) gin_trgm_ops
  );

CREATE INDEX CONCURRENTLY IF NOT EXISTS "Client_campaignName_trgm_idx"
  ON "Client" USING GIN (LOWER(COALESCE("campaignName", '')) gin_trgm_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS "SalesPipeline_notes_trgm_idx"
  ON "SalesPipeline" USING GIN (LOWER(COALESCE("notes", '')) gin_trgm_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS "Client_phone_suffix8_idx"
  ON "Client" (
    RIGHT(REGEXP_REPLACE(COALESCE("phone", ''), '[^0-9]', '', 'g'), 8)
  );
