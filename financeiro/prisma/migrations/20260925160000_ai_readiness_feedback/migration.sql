-- Registra o desfecho de cada sugestão para que a prontidão use sinais humanos
-- observáveis, sem habilitar o agente autônomo.
ALTER TABLE IF EXISTS "AiAssistantOperation"
  ADD COLUMN IF NOT EXISTS "draftId" TEXT,
  ADD COLUMN IF NOT EXISTS "draftVersion" INTEGER,
  ADD COLUMN IF NOT EXISTS "draftOutcome" TEXT,
  ADD COLUMN IF NOT EXISTS "draftWasEdited" BOOLEAN;

DO $$ BEGIN
  IF to_regclass('public."AiAssistantOperation"') IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'AiAssistantOperation_draftOutcome_check'
        AND conrelid = 'public."AiAssistantOperation"'::regclass
    ) THEN
    ALTER TABLE "AiAssistantOperation"
      ADD CONSTRAINT "AiAssistantOperation_draftOutcome_check"
      CHECK ("draftOutcome" IS NULL OR "draftOutcome" IN ('pending', 'inserted', 'sent', 'discarded', 'superseded'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "AiAssistantOperation_draft_version_idx"
  ON "AiAssistantOperation" ("draftId", "draftVersion");
