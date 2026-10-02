CREATE TABLE IF NOT EXISTS "PayrollVacation" (
    "id" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "employeeKey" TEXT NOT NULL,
    "employeeName" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "advanceAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "advancePaidAt" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PayrollVacation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PayrollVacation_unit_employeeKey_startDate_endDate_idx"
ON "PayrollVacation"("unit", "employeeKey", "startDate", "endDate");

CREATE INDEX IF NOT EXISTS "PayrollVacation_unit_advancePaidAt_idx"
ON "PayrollVacation"("unit", "advancePaidAt");
