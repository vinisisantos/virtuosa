import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUnitGuard } from "@/lib/unit-guard";

type SchemaCheckRow = {
  has_outcome_reason: boolean;
  has_evaluation_event: boolean;
};

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const guard = requireUnitGuard(req);
  if (guard instanceof NextResponse) return guard;

  if (!guard.isAdmin && guard.permissions?.admin !== true) {
    return NextResponse.json(
      { error: "Apenas administradores podem executar esta manutenção." },
      { status: 403 },
    );
  }

  try {
    await prisma.$transaction(
      async (tx) => {
        // Evita que uma tabela ocupada deixe a implantação presa indefinidamente.
        await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '10s'");
        await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '25s'");

        await tx.$executeRawUnsafe(`
          ALTER TABLE "Agendamento"
            ADD COLUMN IF NOT EXISTS "outcomeReason" TEXT
        `);

        await tx.$executeRawUnsafe(`
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
          )
        `);

        await tx.$executeRawUnsafe(`
          CREATE INDEX IF NOT EXISTS "EvaluationEvent_evaluationId_createdAt_idx"
            ON "EvaluationEvent"("evaluationId", "createdAt")
        `);
        await tx.$executeRawUnsafe(`
          CREATE INDEX IF NOT EXISTS "EvaluationEvent_unit_createdAt_idx"
            ON "EvaluationEvent"("unit", "createdAt")
        `);
        await tx.$executeRawUnsafe(`
          CREATE INDEX IF NOT EXISTS "EvaluationEvent_eventType_createdAt_idx"
            ON "EvaluationEvent"("eventType", "createdAt")
        `);
      },
      { maxWait: 5_000, timeout: 30_000 },
    );

    const [check] = await prisma.$queryRaw<SchemaCheckRow[]>`
      SELECT
        EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'Agendamento'
            AND column_name = 'outcomeReason'
        ) AS has_outcome_reason,
        to_regclass('public."EvaluationEvent"') IS NOT NULL AS has_evaluation_event
    `;

    if (!check?.has_outcome_reason || !check.has_evaluation_event) {
      return NextResponse.json(
        { error: "A estrutura não foi confirmada após a execução." },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      schema: {
        outcomeReason: check.has_outcome_reason,
        evaluationEvent: check.has_evaluation_event,
      },
    });
  } catch (error) {
    console.error("[Evaluation outcome schema] Falha na manutenção:", error);
    return NextResponse.json(
      {
        error:
          "Não foi possível aplicar a estrutura agora. A operação foi cancelada sem manter alterações parciais.",
      },
      { status: 503 },
    );
  }
}
