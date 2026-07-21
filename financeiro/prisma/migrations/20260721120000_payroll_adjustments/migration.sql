ALTER TABLE "PayrollEntry"
ADD COLUMN IF NOT EXISTS "employmentType" TEXT;

CREATE TABLE IF NOT EXISTS "PayrollAdjustment" (
    "id" TEXT NOT NULL,
    "payrollEntryId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "label" TEXT,
    "quantity" DOUBLE PRECISION,
    "amount" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollAdjustment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PayrollAdjustment_payrollEntryId_idx"
ON "PayrollAdjustment"("payrollEntryId");

DO $$
BEGIN
    ALTER TABLE "PayrollAdjustment"
    ADD CONSTRAINT "PayrollAdjustment_payrollEntryId_fkey"
    FOREIGN KEY ("payrollEntryId") REFERENCES "PayrollEntry"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
