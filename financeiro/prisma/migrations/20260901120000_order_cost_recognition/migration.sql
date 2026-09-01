ALTER TABLE "Order"
ADD COLUMN IF NOT EXISTS "costRecognizedAt" DATE;

CREATE INDEX IF NOT EXISTS "Order_unit_costRecognizedAt_idx"
ON "Order"("unit", "costRecognizedAt");
