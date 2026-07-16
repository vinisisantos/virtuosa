CREATE TABLE IF NOT EXISTS "CampaignBudgetGroup" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "platform" TEXT NOT NULL DEFAULT 'meta_ads',
  "unit" TEXT NOT NULL,
  "dailyBudget" DOUBLE PRECISION NOT NULL,
  "rechargeAmount" DOUBLE PRECISION,
  "rechargeIntervalDays" INTEGER,
  "startDate" TEXT NOT NULL,
  "endDate" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CampaignBudgetGroup_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Campaign" ADD COLUMN IF NOT EXISTS "budgetGroupId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "CampaignBudgetGroup_unit_name_key" ON "CampaignBudgetGroup"("unit", "name");
CREATE INDEX IF NOT EXISTS "CampaignBudgetGroup_unit_isActive_idx" ON "CampaignBudgetGroup"("unit", "isActive");
CREATE INDEX IF NOT EXISTS "CampaignBudgetGroup_platform_idx" ON "CampaignBudgetGroup"("platform");
CREATE INDEX IF NOT EXISTS "Campaign_budgetGroupId_idx" ON "Campaign"("budgetGroupId");

DO $$ BEGIN
  ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_budgetGroupId_fkey"
    FOREIGN KEY ("budgetGroupId") REFERENCES "CampaignBudgetGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

INSERT INTO "CampaignBudgetGroup" (
  "id", "name", "platform", "unit", "dailyBudget", "rechargeAmount",
  "rechargeIntervalDays", "startDate", "isActive", "createdBy", "updatedAt"
) VALUES (
  'campaign-budget-group-meta-osasco', 'Meta Osasco', 'meta_ads', 'Osasco',
  213, 426, 2, '2026-06-01', true, 'Configuração operacional', CURRENT_TIMESTAMP
)
ON CONFLICT ("unit", "name") DO UPDATE SET
  "dailyBudget" = EXCLUDED."dailyBudget",
  "rechargeAmount" = EXCLUDED."rechargeAmount",
  "rechargeIntervalDays" = EXCLUDED."rechargeIntervalDays",
  "startDate" = EXCLUDED."startDate",
  "isActive" = true,
  "updatedAt" = CURRENT_TIMESTAMP;

UPDATE "Campaign"
SET "budgetGroupId" = 'campaign-budget-group-meta-osasco', "budget" = NULL, "status" = 'ativa'
WHERE "unit" = 'Osasco'
  AND lower("name") IN ('gordura localizada', 'barriga trincada', 'botox', 'hyperslim');

UPDATE "Campaign"
SET "budgetGroupId" = NULL, "status" = 'pausada'
WHERE "unit" = 'Osasco'
  AND lower("name") IN ('emagrecimento e definição', 'monjifast');
