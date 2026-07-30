CREATE TABLE IF NOT EXISTS "CrmLeadCountAdjustment" (
    "id" TEXT NOT NULL,
    "adjustmentKey" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "count" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "assignedTo" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrmLeadCountAdjustment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CrmLeadCountAdjustment_adjustmentKey_key"
ON "CrmLeadCountAdjustment"("adjustmentKey");

CREATE INDEX IF NOT EXISTS "CrmLeadCountAdjustment_unit_date_idx"
ON "CrmLeadCountAdjustment"("unit", "date");

CREATE INDEX IF NOT EXISTS "CrmLeadCountAdjustment_assignedTo_date_idx"
ON "CrmLeadCountAdjustment"("assignedTo", "date");

INSERT INTO "CrmLeadCountAdjustment" (
    "id",
    "adjustmentKey",
    "unit",
    "date",
    "count",
    "reason",
    "assignedTo",
    "createdBy",
    "createdAt",
    "updatedAt"
)
VALUES (
    'manual-osasco-2026-07-30-whatsapp-banido',
    'manual-osasco-2026-07-30-whatsapp-banido',
    'Osasco',
    DATE '2026-07-30',
    4,
    'Leads recebidos enquanto o WhatsApp de leads de Osasco estava banido',
    (
      SELECT "userId"
      FROM "WhatsAppInstance"
      WHERE "name" = 'virt-fec07311'
        AND "unit" = 'Osasco'
      ORDER BY "updatedAt" DESC
      LIMIT 1
    ),
    'Vinicius Santos',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
)
ON CONFLICT ("adjustmentKey") DO UPDATE SET
    "count" = EXCLUDED."count",
    "reason" = EXCLUDED."reason",
    "assignedTo" = COALESCE(EXCLUDED."assignedTo", "CrmLeadCountAdjustment"."assignedTo"),
    "updatedAt" = CURRENT_TIMESTAMP;
