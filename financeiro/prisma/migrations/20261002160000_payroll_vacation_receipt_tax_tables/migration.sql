ALTER TABLE "PayrollVacation"
  ADD COLUMN IF NOT EXISTS "receipt" JSONB,
  ADD COLUMN IF NOT EXISTS "advanceCostMode" TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS "linkedBackupId" TEXT,
  ADD COLUMN IF NOT EXISTS "linkedBillId" INTEGER;

ALTER TABLE "PayrollEntry"
  ADD COLUMN IF NOT EXISTS "transportActualCost" DOUBLE PRECISION;

CREATE TABLE IF NOT EXISTS "PayrollTaxTable" (
  "year" INTEGER NOT NULL PRIMARY KEY,
  "inssBrackets" JSONB NOT NULL,
  "irrfTable" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO "PayrollTaxTable" ("year", "inssBrackets", "irrfTable")
VALUES (
  2026,
  '[{"limit":1621,"rate":0.075},{"limit":2902.84,"rate":0.09},{"limit":4354.27,"rate":0.12},{"limit":8475.55,"rate":0.14}]'::jsonb,
  '{"brackets":[{"limit":2428.8,"rate":0,"deduction":0},{"limit":2826.65,"rate":0.075,"deduction":182.16},{"limit":3751.05,"rate":0.15,"deduction":394.16},{"limit":4664.68,"rate":0.225,"deduction":675.49},{"limit":null,"rate":0.275,"deduction":908.73}],"simplifiedDeduction":607.2,"reduction":{"fullReliefUpTo":5000,"partialReliefUpTo":7350,"partialIntercept":978.62,"partialRate":0.133145}}'::jsonb
)
ON CONFLICT ("year") DO NOTHING;
