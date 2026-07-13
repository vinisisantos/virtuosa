CREATE TABLE IF NOT EXISTS "AiTrainingConversation" (
  "id" TEXT NOT NULL,
  "unit" TEXT NOT NULL,
  "title" TEXT,
  "createdById" TEXT NOT NULL,
  "createdByName" TEXT,
  "archived" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiTrainingConversation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AiTrainingMessage" (
  "id" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "originalContent" TEXT,
  "model" TEXT,
  "guardrailFlags" JSONB,
  "createdById" TEXT,
  "createdByName" TEXT,
  "editedById" TEXT,
  "editedByName" TEXT,
  "editedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiTrainingMessage_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AiTrainingMessage_conversationId_fkey"
    FOREIGN KEY ("conversationId") REFERENCES "AiTrainingConversation"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

ALTER TABLE "AiTrainingMessage" ADD COLUMN IF NOT EXISTS "createdById" TEXT;
ALTER TABLE "AiTrainingMessage" ADD COLUMN IF NOT EXISTS "createdByName" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'AiTrainingMessage_conversationId_fkey'
  ) THEN
    ALTER TABLE "AiTrainingMessage"
      ADD CONSTRAINT "AiTrainingMessage_conversationId_fkey"
      FOREIGN KEY ("conversationId") REFERENCES "AiTrainingConversation"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "AiTrainingMemory" (
  "id" TEXT NOT NULL,
  "unit" TEXT NOT NULL,
  "sourceType" TEXT NOT NULL,
  "sourceReference" TEXT NOT NULL,
  "sourceConversationId" TEXT,
  "triggerText" TEXT NOT NULL,
  "originalAnswer" TEXT,
  "correctedAnswer" TEXT NOT NULL,
  "category" TEXT NOT NULL DEFAULT 'response_example',
  "status" TEXT NOT NULL DEFAULT 'pending',
  "riskFlags" JSONB NOT NULL DEFAULT '[]',
  "createdById" TEXT,
  "createdByName" TEXT,
  "reviewedById" TEXT,
  "reviewedByName" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiTrainingMemory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AiTrainingConversation_unit_updatedAt_idx"
  ON "AiTrainingConversation"("unit", "updatedAt");
CREATE INDEX IF NOT EXISTS "AiTrainingConversation_createdById_updatedAt_idx"
  ON "AiTrainingConversation"("createdById", "updatedAt");
CREATE INDEX IF NOT EXISTS "AiTrainingConversation_archived_updatedAt_idx"
  ON "AiTrainingConversation"("archived", "updatedAt");
CREATE INDEX IF NOT EXISTS "AiTrainingMessage_conversationId_createdAt_idx"
  ON "AiTrainingMessage"("conversationId", "createdAt");
CREATE INDEX IF NOT EXISTS "AiTrainingMessage_createdById_createdAt_idx"
  ON "AiTrainingMessage"("createdById", "createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "AiTrainingMemory_sourceReference_key"
  ON "AiTrainingMemory"("sourceReference");
CREATE INDEX IF NOT EXISTS "AiTrainingMemory_unit_status_updatedAt_idx"
  ON "AiTrainingMemory"("unit", "status", "updatedAt");
CREATE INDEX IF NOT EXISTS "AiTrainingMemory_status_createdAt_idx"
  ON "AiTrainingMemory"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "AiTrainingMemory_category_status_idx"
  ON "AiTrainingMemory"("category", "status");
CREATE INDEX IF NOT EXISTS "AiTrainingMemory_sourceConversationId_idx"
  ON "AiTrainingMemory"("sourceConversationId");
