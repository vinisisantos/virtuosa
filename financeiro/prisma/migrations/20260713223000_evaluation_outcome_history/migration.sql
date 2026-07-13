ALTER TABLE "Agendamento"
  ADD COLUMN IF NOT EXISTS "outcomeReason" TEXT;

CREATE TABLE IF NOT EXISTS "EvaluationEvent" (
  "id" TEXT NOT NULL,
  "evaluationId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "fromStatus" TEXT,
  "toStatus" TEXT,
  "reason" TEXT,
  "saleValue" DOUBLE PRECISION,
  "previousStartTime" TIMESTAMP(3),
  "newStartTime" TIMESTAMP(3),
  "userId" TEXT,
  "userName" TEXT NOT NULL,
  "unit" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EvaluationEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EvaluationEvent_evaluationId_fkey"
    FOREIGN KEY ("evaluationId") REFERENCES "Agendamento"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "EvaluationEvent_evaluationId_createdAt_idx"
  ON "EvaluationEvent"("evaluationId", "createdAt");
CREATE INDEX IF NOT EXISTS "EvaluationEvent_unit_createdAt_idx"
  ON "EvaluationEvent"("unit", "createdAt");
CREATE INDEX IF NOT EXISTS "EvaluationEvent_eventType_createdAt_idx"
  ON "EvaluationEvent"("eventType", "createdAt");
