CREATE TABLE IF NOT EXISTS "AiUnitKnowledge" (
  "id" TEXT NOT NULL,
  "unit" TEXT NOT NULL,
  "address" TEXT,
  "hours" TEXT,
  "generalRules" TEXT,
  "updatedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiUnitKnowledge_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AiUnitKnowledge_unit_key" ON "AiUnitKnowledge"("unit");
CREATE INDEX IF NOT EXISTS "AiUnitKnowledge_unit_idx" ON "AiUnitKnowledge"("unit");

CREATE TABLE IF NOT EXISTS "AiKnowledgeProcedure" (
  "id" TEXT NOT NULL,
  "unit" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "aliases" JSONB NOT NULL DEFAULT '[]',
  "howItWorks" TEXT NOT NULL,
  "indications" TEXT,
  "whatToSay" TEXT,
  "whatNotToSay" TEXT,
  "priceRange" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "approvedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiKnowledgeProcedure_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AiKnowledgeProcedure_unit_active_idx" ON "AiKnowledgeProcedure"("unit", "active");
CREATE INDEX IF NOT EXISTS "AiKnowledgeProcedure_name_idx" ON "AiKnowledgeProcedure"("name");

CREATE TABLE IF NOT EXISTS "AiKnowledgeSuggestion" (
  "id" TEXT NOT NULL,
  "unit" TEXT NOT NULL,
  "sourceConversationId" TEXT,
  "sourceMessageId" TEXT,
  "sourceType" TEXT NOT NULL DEFAULT 'consultant_message',
  "procedureName" TEXT,
  "title" TEXT NOT NULL,
  "excerpt" TEXT,
  "suggestedContent" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "reviewedBy" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiKnowledgeSuggestion_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AiKnowledgeSuggestion_unit_status_idx" ON "AiKnowledgeSuggestion"("unit", "status");
CREATE INDEX IF NOT EXISTS "AiKnowledgeSuggestion_sourceMessageId_idx" ON "AiKnowledgeSuggestion"("sourceMessageId");
CREATE INDEX IF NOT EXISTS "AiKnowledgeSuggestion_sourceConversationId_idx" ON "AiKnowledgeSuggestion"("sourceConversationId");

CREATE TABLE IF NOT EXISTS "WhatsAppMessageTranscript" (
  "id" TEXT NOT NULL,
  "whatsAppMessageId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "transcript" TEXT,
  "language" TEXT,
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WhatsAppMessageTranscript_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "WhatsAppMessageTranscript_whatsAppMessageId_key" ON "WhatsAppMessageTranscript"("whatsAppMessageId");
CREATE INDEX IF NOT EXISTS "WhatsAppMessageTranscript_status_idx" ON "WhatsAppMessageTranscript"("status");
CREATE INDEX IF NOT EXISTS "WhatsAppMessageTranscript_provider_model_idx" ON "WhatsAppMessageTranscript"("provider", "model");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'WhatsAppMessageTranscript_whatsAppMessageId_fkey'
  ) THEN
    ALTER TABLE "WhatsAppMessageTranscript"
      ADD CONSTRAINT "WhatsAppMessageTranscript_whatsAppMessageId_fkey"
      FOREIGN KEY ("whatsAppMessageId") REFERENCES "WhatsAppMessage"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

UPDATE "AiShadowDraft"
SET
  "status" = 'error',
  "error" = COALESCE("error", 'Resposta vazia ou inválida importada antes da validação rígida. Reprocesse o comparativo.'),
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "status" = 'generated'
  AND COALESCE(
    CASE
      WHEN jsonb_typeof("messages") = 'array' THEN jsonb_array_length("messages")
      ELSE 0
    END,
    0
  ) = 0
  AND COALESCE(BTRIM("handoffReason"), '') = '';

UPDATE "AiShadowRun" AS run
SET
  "status" = 'failed',
  "error" = COALESCE(run."error", 'Par incompleto: um dos modelos gerou resposta vazia ou inválida. Reprocesse antes de avaliar.'),
  "processedAt" = CURRENT_TIMESTAMP,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE run."status" = 'ready'
  AND EXISTS (
    SELECT 1
    FROM "AiShadowDraft" draft
    WHERE draft."runId" = run."id"
      AND draft."status" = 'error'
  );
