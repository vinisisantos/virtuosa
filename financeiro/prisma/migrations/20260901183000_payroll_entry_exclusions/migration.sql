CREATE TABLE IF NOT EXISTS "PayrollEntryExclusion" (
    "id" TEXT NOT NULL,
    "competenceMonth" INTEGER NOT NULL,
    "competenceYear" INTEGER NOT NULL,
    "unit" TEXT NOT NULL,
    "employeeKey" TEXT NOT NULL,
    "employeeName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayrollEntryExclusion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PayrollEntryExclusion_competenceMonth_competenceYear_unit_employeeKey_key"
ON "PayrollEntryExclusion"("competenceMonth", "competenceYear", "unit", "employeeKey");
