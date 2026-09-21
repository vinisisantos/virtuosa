-- Copiloto de respostas restrito a SBC. O modo automatico permanece bloqueado.
ALTER TABLE "WhatsAppConversation"
  ADD COLUMN IF NOT EXISTS "aiMode" TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS "aiModeUpdatedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "aiModeUpdatedBy" TEXT;

ALTER TABLE "WhatsAppConversation"
  DROP CONSTRAINT IF EXISTS "WhatsAppConversation_aiMode_check";
ALTER TABLE "WhatsAppConversation"
  ADD CONSTRAINT "WhatsAppConversation_aiMode_check"
  CHECK ("aiMode" IN ('manual', 'suggestions'));

CREATE TABLE IF NOT EXISTS "AiAssistantDraft" (
  "id" TEXT PRIMARY KEY,
  "conversationId" TEXT NOT NULL UNIQUE REFERENCES "WhatsAppConversation"("id") ON DELETE CASCADE,
  "unit" TEXT NOT NULL DEFAULT 'SBC' CHECK ("unit" = 'SBC'),
  "sourceFingerprint" TEXT NOT NULL,
  "sourceMessageId" TEXT,
  "content" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active' CHECK ("status" IN ('active', 'inserted', 'sent', 'discarded')),
  "version" INTEGER NOT NULL DEFAULT 1,
  "model" TEXT NOT NULL,
  "generatedBy" TEXT,
  "usedBy" TEXT,
  "usedAt" TIMESTAMP(3),
  "sentMessageId" TEXT,
  "editedContent" TEXT,
  "usage" JSONB,
  "history" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "AiAssistantDraft_scope_idx"
  ON "AiAssistantDraft" ("unit", "status", "updatedAt");

CREATE TABLE IF NOT EXISTS "AiAssistantOperation" (
  "id" TEXT PRIMARY KEY,
  "unit" TEXT NOT NULL DEFAULT 'SBC' CHECK ("unit" = 'SBC'),
  "kind" TEXT NOT NULL,
  "conversationId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'running' CHECK ("status" IN ('running', 'completed', 'failed')),
  "reservedMicroUsd" INTEGER NOT NULL,
  "actualMicroUsd" INTEGER,
  "usage" JSONB,
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3)
);

CREATE INDEX IF NOT EXISTS "AiAssistantOperation_day_idx"
  ON "AiAssistantOperation" ("unit", "createdAt", "kind");

INSERT INTO "AppSetting" ("id", "key", "value", "createdAt", "updatedAt")
VALUES (
  gen_random_uuid()::text,
  'ai_assistant_sbc_v1',
  jsonb_build_object(
    'enabled', true,
    'activatedAt', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'unit', 'SBC',
    'businessDescription', 'Clínica Virtuosa São Bernardo, especializada em estética facial e corporal.',
    'businessHours', '',
    'email', '',
    'website', '',
    'purchasePolicy', 'O atendimento começa por uma avaliação para entender o objetivo do cliente e indicar o cuidado adequado.',
    'paymentPolicy', '',
    'discountPolicy', '',
    'customInstructions', 'Conduza uma etapa por vez, sem repetir informações já confirmadas. Quando não compreender a mensagem, peça ao cliente para explicar novamente.',
    'allowEmojis', true,
    'sharePrices', true,
    'askClientInfoAt', 'ready_to_schedule',
    'dailyBudgetMicroUsd', 1000000,
    'agentEnabled', false
  )::text,
  now(),
  now()
)
ON CONFLICT ("key") DO NOTHING;

ALTER TABLE "AiAssistantDraft" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AiAssistantOperation" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "AiAssistantDraft", "AiAssistantOperation" FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON "AiAssistantDraft", "AiAssistantOperation" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON "AiAssistantDraft", "AiAssistantOperation" FROM authenticated;
  END IF;
END $$;
