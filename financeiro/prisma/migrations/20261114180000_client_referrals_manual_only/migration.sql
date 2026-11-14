ALTER TABLE "Client"
  ADD COLUMN IF NOT EXISTS "manualOnly" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "manualOnlyPhoneKey" TEXT;

CREATE TABLE IF NOT EXISTS "ClientReferral" (
  "id" TEXT NOT NULL,
  "salesPipelineId" TEXT,
  "referredClientId" TEXT NOT NULL,
  "referrerClientId" TEXT,
  "referrerName" TEXT NOT NULL,
  "unit" TEXT NOT NULL,
  "registeredByUserId" TEXT,
  "registeredByName" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ClientReferral_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ClientReferral_not_self_referral_check"
    CHECK ("referrerClientId" IS NULL OR "referrerClientId" <> "referredClientId")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ClientReferral_salesPipelineId_key"
  ON "ClientReferral"("salesPipelineId");
CREATE UNIQUE INDEX IF NOT EXISTS "ClientReferral_idempotencyKey_key"
  ON "ClientReferral"("idempotencyKey");
CREATE INDEX IF NOT EXISTS "ClientReferral_referrerClientId_unit_createdAt_idx"
  ON "ClientReferral"("referrerClientId", "unit", "createdAt");
CREATE INDEX IF NOT EXISTS "ClientReferral_referredClientId_createdAt_idx"
  ON "ClientReferral"("referredClientId", "createdAt");
CREATE INDEX IF NOT EXISTS "ClientReferral_unit_createdAt_idx"
  ON "ClientReferral"("unit", "createdAt");

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = '"ClientReferral"'::regclass
      AND conname = 'ClientReferral_not_self_referral_check'
  ) THEN
    ALTER TABLE "ClientReferral"
      ADD CONSTRAINT "ClientReferral_not_self_referral_check"
      CHECK ("referrerClientId" IS NULL OR "referrerClientId" <> "referredClientId");
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = '"ClientReferral"'::regclass
      AND conname = 'ClientReferral_salesPipelineId_fkey'
  ) THEN
    ALTER TABLE "ClientReferral"
      ADD CONSTRAINT "ClientReferral_salesPipelineId_fkey"
      FOREIGN KEY ("salesPipelineId") REFERENCES "SalesPipeline"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = '"ClientReferral"'::regclass
      AND conname = 'ClientReferral_referredClientId_fkey'
  ) THEN
    ALTER TABLE "ClientReferral"
      ADD CONSTRAINT "ClientReferral_referredClientId_fkey"
      FOREIGN KEY ("referredClientId") REFERENCES "Client"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = '"ClientReferral"'::regclass
      AND conname = 'ClientReferral_referrerClientId_fkey'
  ) THEN
    ALTER TABLE "ClientReferral"
      ADD CONSTRAINT "ClientReferral_referrerClientId_fkey"
      FOREIGN KEY ("referrerClientId") REFERENCES "Client"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$migration$;
