import type { Prisma } from "@prisma/client";
import { formatProcedureNames, normalizeProcedureNames } from "@/lib/pipeline/procedure-names";

type AuditLogDatabase = Pick<Prisma.TransactionClient, "auditLog">;

type ProcedureAuditDetails = {
  procedureName?: unknown;
  procedureNames?: unknown;
};

function parseProcedureNames(details: string) {
  try {
    const parsed = JSON.parse(details) as ProcedureAuditDetails;
    const procedureNames = normalizeProcedureNames(parsed.procedureNames);
    return procedureNames.length > 0
      ? procedureNames
      : normalizeProcedureNames(parsed.procedureName);
  } catch {
    return [];
  }
}

export async function getPipelineProcedureSelections(
  database: AuditLogDatabase,
  dealIds: string[],
) {
  const uniqueDealIds = [...new Set(dealIds.filter(Boolean))];
  const procedureSelections = new Map<string, string[]>();

  if (uniqueDealIds.length === 0) return procedureSelections;

  const logs = await database.auditLog.findMany({
    where: {
      action: "update",
      entity: "pipeline",
      entityId: { in: uniqueDealIds },
      details: { contains: '"procedureName"' },
    },
    select: {
      entityId: true,
      details: true,
    },
    orderBy: { createdAt: "desc" },
  });

  for (const log of logs) {
    if (procedureSelections.has(log.entityId)) continue;
    const procedureNames = parseProcedureNames(log.details);
    if (procedureNames.length > 0) procedureSelections.set(log.entityId, procedureNames);
  }

  return procedureSelections;
}

export async function getPipelineProcedureNames(
  database: AuditLogDatabase,
  dealIds: string[],
) {
  const procedureSelections = await getPipelineProcedureSelections(database, dealIds);
  const procedureNames = new Map<string, string>();
  for (const [dealId, selections] of procedureSelections) {
    procedureNames.set(dealId, formatProcedureNames(selections));
  }
  return procedureNames;
}

type RecordPipelineProcedureAuditParams = {
  dealId: string;
  procedureName?: string;
  procedureNames?: string[];
  userName: string;
  unit: string;
  saleValue?: number | null;
  stage?: string;
  clientName?: string;
  source?: string;
};

export async function recordPipelineProcedureAudit(
  database: AuditLogDatabase,
  params: RecordPipelineProcedureAuditParams,
) {
  const procedureNames = normalizeProcedureNames(params.procedureNames ?? params.procedureName);
  const procedureName = formatProcedureNames(procedureNames);
  if (!procedureName) return null;

  return database.auditLog.create({
    data: {
      userName: params.userName || "Sistema",
      action: "update",
      entity: "pipeline",
      entityId: params.dealId,
      unit: params.unit,
      details: JSON.stringify({
        eventType: "pipeline_sale_details",
        procedureName,
        procedureNames,
        ...(params.saleValue != null && Number.isFinite(params.saleValue)
          ? { saleValue: params.saleValue }
          : {}),
        ...(params.stage ? { stage: params.stage } : {}),
        ...(params.clientName ? { clientName: params.clientName } : {}),
        source: params.source || "pipeline",
      }),
    },
  });
}
