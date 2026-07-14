import type { Prisma } from "@prisma/client";

type AuditLogDatabase = Pick<Prisma.TransactionClient, "auditLog">;

type ProcedureAuditDetails = {
  procedureName?: unknown;
};

function parseProcedureName(details: string) {
  try {
    const parsed = JSON.parse(details) as ProcedureAuditDetails;
    const procedureName =
      typeof parsed.procedureName === "string" ? parsed.procedureName.trim() : "";

    return procedureName || null;
  } catch {
    return null;
  }
}

export async function getPipelineProcedureNames(
  database: AuditLogDatabase,
  dealIds: string[],
) {
  const uniqueDealIds = [...new Set(dealIds.filter(Boolean))];
  const procedureNames = new Map<string, string>();

  if (uniqueDealIds.length === 0) {
    return procedureNames;
  }

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
    if (procedureNames.has(log.entityId)) {
      continue;
    }

    const procedureName = parseProcedureName(log.details);
    if (procedureName) {
      procedureNames.set(log.entityId, procedureName);
    }
  }

  return procedureNames;
}

type RecordPipelineProcedureAuditParams = {
  dealId: string;
  procedureName: string;
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
  const procedureName = params.procedureName.trim();
  if (!procedureName) {
    return null;
  }

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
