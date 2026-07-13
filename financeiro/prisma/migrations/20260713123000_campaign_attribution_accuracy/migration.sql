-- Preserve the legacy source/campaign fields and record how future campaign
-- attribution was obtained. Existing rows remain NULL and are treated as
-- historical data requiring evidence instead of being silently reclassified.
ALTER TABLE "Client"
  ADD COLUMN IF NOT EXISTS "campaignAttribution" TEXT;

-- Campaign analytics filters by unit and effective lead date. These indexes
-- keep the two date branches (arrivedAt and createdAt fallback) bounded.
CREATE INDEX IF NOT EXISTS "Client_unit_isActive_arrivedAt_idx"
  ON "Client"("unit", "isActive", "arrivedAt");

CREATE INDEX IF NOT EXISTS "Client_unit_isActive_createdAt_idx"
  ON "Client"("unit", "isActive", "createdAt");
