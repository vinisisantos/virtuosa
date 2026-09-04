ALTER TABLE "WhatsAppSavedReplyCategory"
  ADD COLUMN IF NOT EXISTS "campaignName" TEXT;

UPDATE "WhatsAppSavedReplyCategory"
SET "campaignName" = 'Harmonização Mamas'
WHERE "normalizedTitle" = 'harmonizacao de mamas'
  AND NULLIF(BTRIM("campaignName"), '') IS NULL;
