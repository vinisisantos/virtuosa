CREATE TABLE IF NOT EXISTS "PipelineSaleItem" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "pipelineDealId" TEXT NOT NULL,
    "serviceCatalogId" TEXT,
    "procedureName" TEXT NOT NULL,
    "sessions" INTEGER NOT NULL,
    "unitPrice" DOUBLE PRECISION NOT NULL,
    "subtotal" DOUBLE PRECISION NOT NULL,
    "paidAmount" DOUBLE PRECISION NOT NULL,
    "discountAmount" DOUBLE PRECISION NOT NULL,
    "itemType" TEXT NOT NULL DEFAULT 'paid',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PipelineSaleItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PipelineSaleItem_pipelineDealId_idx"
  ON "PipelineSaleItem"("pipelineDealId");

CREATE INDEX IF NOT EXISTS "PipelineSaleItem_serviceCatalogId_idx"
  ON "PipelineSaleItem"("serviceCatalogId");

CREATE INDEX IF NOT EXISTS "PipelineSaleItem_procedureName_idx"
  ON "PipelineSaleItem"("procedureName");

DO $$
BEGIN
    ALTER TABLE "PipelineSaleItem"
        ADD CONSTRAINT "PipelineSaleItem_pipelineDealId_fkey"
        FOREIGN KEY ("pipelineDealId") REFERENCES "SalesPipeline"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE "PipelineSaleItem"
        ADD CONSTRAINT "PipelineSaleItem_serviceCatalogId_fkey"
        FOREIGN KEY ("serviceCatalogId") REFERENCES "ServiceCatalog"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
