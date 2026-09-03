CREATE TABLE IF NOT EXISTS "PaymentMethodFeeConfig" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "name" TEXT NOT NULL,
  "method" TEXT NOT NULL,
  "brand" TEXT,
  "unit" TEXT NOT NULL DEFAULT 'Barueri',
  "fixedFee" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "fixedRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "installmentRates" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "feePayer" TEXT NOT NULL DEFAULT 'clinic',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PaymentMethodFeeConfig_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Package"
  ADD COLUMN IF NOT EXISTS "paymentFeeConfigId" TEXT,
  ADD COLUMN IF NOT EXISTS "paymentProvider" TEXT,
  ADD COLUMN IF NOT EXISTS "paymentBrand" TEXT,
  ADD COLUMN IF NOT EXISTS "paymentFixedFee" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "paymentFixedRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "paymentInstallmentRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "paymentFeePayer" TEXT NOT NULL DEFAULT 'clinic',
  ADD COLUMN IF NOT EXISTS "paymentFeeAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "chargedValue" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "netValue" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "installmentValues" JSONB;

CREATE INDEX IF NOT EXISTS "PaymentMethodFeeConfig_unit_method_isActive_idx"
  ON "PaymentMethodFeeConfig"("unit", "method", "isActive");

CREATE INDEX IF NOT EXISTS "PaymentMethodFeeConfig_unit_name_idx"
  ON "PaymentMethodFeeConfig"("unit", "name");

CREATE INDEX IF NOT EXISTS "Package_paymentFeeConfigId_idx"
  ON "Package"("paymentFeeConfigId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'Package_paymentFeeConfigId_fkey'
      AND conrelid = '"Package"'::regclass
  ) THEN
    ALTER TABLE "Package"
      ADD CONSTRAINT "Package_paymentFeeConfigId_fkey"
      FOREIGN KEY ("paymentFeeConfigId") REFERENCES "PaymentMethodFeeConfig"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
