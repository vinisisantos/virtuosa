import type { Prisma } from "@prisma/client";

import { getPipelineDealIdFromEvaluationNotes } from "@/lib/evaluation-scheduling";
import { isScheduledPipelineStage } from "@/lib/pipeline/stages";

export const PIPELINE_SCHEDULED_STAGE_ACTION = "stage_scheduled";
const PIPELINE_AUDIT_ENTITY = "pipeline";

type ScheduledStageEventDatabase = Pick<
  Prisma.TransactionClient,
  "agendamento" | "auditLog" | "salesPipeline"
>;

export function didPipelineMoveToScheduled(params: {
  previousStage?: string | null;
  previousStageId?: string | null;
  nextStage?: string | null;
  nextStageId?: string | null;
}) {
  return (
    isScheduledPipelineStage(params.nextStage) &&
    (params.previousStage !== params.nextStage || params.previousStageId !== params.nextStageId)
  );
}

export async function recordPipelineScheduledStageEvent(
  database: Pick<Prisma.TransactionClient, "auditLog">,
  params: {
    dealId: string;
    clientName: string;
    unit: string;
    userName: string;
  },
) {
  return database.auditLog.create({
    data: {
      userName: params.userName,
      action: PIPELINE_SCHEDULED_STAGE_ACTION,
      entity: PIPELINE_AUDIT_ENTITY,
      entityId: params.dealId,
      details: `Oportunidade "${params.clientName}" recebeu o status Agendado`,
      unit: params.unit,
    },
  });
}

export async function countDealsScheduledInRange(params: {
  database: ScheduledStageEventDatabase;
  range: { gte?: Date; lte?: Date };
  unit?: string | null;
}) {
  const [stageLogs, createdAppointments] = await Promise.all([
    params.database.auditLog.findMany({
      where: {
        entity: PIPELINE_AUDIT_ENTITY,
        createdAt: params.range,
        OR: [
          { action: PIPELINE_SCHEDULED_STAGE_ACTION },
          {
            action: "update",
            details: { contains: "estágio: agendado", mode: "insensitive" },
          },
        ],
      },
      select: { action: true, entityId: true, unit: true },
    }),
    params.database.agendamento.findMany({
      where: {
        createdAt: params.range,
        procedimento: { contains: "Avalia", mode: "insensitive" },
        notes: { contains: "[pipelineDealId:" },
      },
      select: { notes: true, unit: true },
    }),
  ]);

  const legacyLogs = stageLogs.filter((log) => log.action !== PIPELINE_SCHEDULED_STAGE_ACTION);
  const legacyDealIds = [...new Set(legacyLogs.map((log) => log.entityId).filter(Boolean))];
  const legacyDeals = legacyDealIds.length
    ? await params.database.salesPipeline.findMany({
        where: { id: { in: legacyDealIds } },
        select: { id: true, unit: true },
      })
    : [];
  const legacyUnitByDealId = new Map(legacyDeals.map((deal) => [deal.id, deal.unit]));
  const scheduledDealIds = new Set<string>();

  for (const log of stageLogs) {
    if (!log.entityId) continue;
    const eventUnit = log.action === PIPELINE_SCHEDULED_STAGE_ACTION
      ? log.unit
      : legacyUnitByDealId.get(log.entityId) || log.unit;
    if (params.unit && eventUnit !== params.unit) continue;
    scheduledDealIds.add(log.entityId);
  }

  for (const appointment of createdAppointments) {
    if (params.unit && appointment.unit !== params.unit) continue;
    const dealId = getPipelineDealIdFromEvaluationNotes(appointment.notes);
    if (dealId) scheduledDealIds.add(dealId);
  }

  return scheduledDealIds.size;
}
