ALTER TABLE "WhatsAppInstance"
  ADD COLUMN IF NOT EXISTS "provider" TEXT NOT NULL DEFAULT 'evolution';

CREATE INDEX IF NOT EXISTS "WhatsAppInstance_provider_idx"
  ON "WhatsAppInstance"("provider");
