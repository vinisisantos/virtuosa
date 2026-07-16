ALTER TABLE "SalesPipeline"
  ADD COLUMN IF NOT EXISTS "campaignIdSnapshot" TEXT,
  ADD COLUMN IF NOT EXISTS "campaignNameSnapshot" TEXT,
  ADD COLUMN IF NOT EXISTS "campaignAttributionSnapshot" TEXT;

ALTER TABLE "PipelineSaleItem"
  ADD COLUMN IF NOT EXISTS "classification" TEXT NOT NULL DEFAULT 'direct',
  ADD COLUMN IF NOT EXISTS "campaignIncludedSessions" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "CampaignOfferItem" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "campaignId" TEXT NOT NULL,
  "serviceCatalogId" TEXT NOT NULL,
  "procedureName" TEXT NOT NULL,
  "includedSessions" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CampaignOfferItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CampaignOfferItem_campaignId_serviceCatalogId_key"
  ON "CampaignOfferItem"("campaignId", "serviceCatalogId");

CREATE INDEX IF NOT EXISTS "CampaignOfferItem_campaignId_idx"
  ON "CampaignOfferItem"("campaignId");

CREATE INDEX IF NOT EXISTS "CampaignOfferItem_serviceCatalogId_idx"
  ON "CampaignOfferItem"("serviceCatalogId");

DO $$
BEGIN
  ALTER TABLE "CampaignOfferItem"
    ADD CONSTRAINT "CampaignOfferItem_campaignId_fkey"
    FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "CampaignOfferItem"
    ADD CONSTRAINT "CampaignOfferItem_serviceCatalogId_fkey"
    FOREIGN KEY ("serviceCatalogId") REFERENCES "ServiceCatalog"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
