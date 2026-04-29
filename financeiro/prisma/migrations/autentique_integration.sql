-- Autentique Digital Signature Integration
-- Add new columns to DigitalContract table

ALTER TABLE "DigitalContract" ADD COLUMN IF NOT EXISTS "autentiqueDocId" TEXT;
ALTER TABLE "DigitalContract" ADD COLUMN IF NOT EXISTS "autentiqueSignId" TEXT;
ALTER TABLE "DigitalContract" ADD COLUMN IF NOT EXISTS "signatureLink" TEXT;
ALTER TABLE "DigitalContract" ADD COLUMN IF NOT EXISTS "signedPdfUrl" TEXT;
ALTER TABLE "DigitalContract" ADD COLUMN IF NOT EXISTS "deliveryMethod" TEXT;
ALTER TABLE "DigitalContract" ADD COLUMN IF NOT EXISTS "autentiqueStatus" TEXT;

-- Add index on autentiqueDocId for webhook lookups
CREATE INDEX IF NOT EXISTS "DigitalContract_autentiqueDocId_idx" ON "DigitalContract"("autentiqueDocId");
