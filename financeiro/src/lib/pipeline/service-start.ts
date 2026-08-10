import type { Prisma } from "@prisma/client";

import {
  isNewLeadPipelineStage,
  normalizedPipelineStageName,
  resolveServiceStartUnit,
} from "@/lib/pipeline/service-start-policy";

type ServiceStageDatabase = Pick<
  Prisma.TransactionClient,
  "auditLog" | "client" | "pipelineStage" | "salesPipeline"
>;

type ServiceStageTransition =
  | { status: "moved"; dealId: string; stageId: string; stageName: string; unit: string }
  | { status: "not_applicable"; reason: string };

function phoneSuffix(value?: string | null) {
  const digits = (value || "").replace(/\D/g, "");
  return digits.length >= 8 ? digits.slice(-8) : null;
}

export async function advanceNewLeadToServiceStage(params: {
  database: ServiceStageDatabase;
  phone?: string | null;
  contactUnit?: string | null;
  instanceUnit?: string | null;
  userName?: string | null;
}): Promise<ServiceStageTransition> {
  const unit = resolveServiceStartUnit(params.contactUnit, params.instanceUnit);
  if (!unit) return { status: "not_applicable", reason: "unit_not_resolved" };

  const suffix = phoneSuffix(params.phone);
  if (!suffix) return { status: "not_applicable", reason: "invalid_phone" };

  const clients = await params.database.client.findMany({
    where: {
      isActive: true,
      unit,
      phone: { contains: suffix },
    },
    select: { id: true },
    orderBy: { updatedAt: "desc" },
    take: 10,
  });
  if (clients.length === 0) return { status: "not_applicable", reason: "client_not_found" };

  const deals = await params.database.salesPipeline.findMany({
    where: {
      clientId: { in: clients.map((client) => client.id) },
      unit,
      closedAt: null,
      lostReason: null,
    },
    select: {
      id: true,
      clientId: true,
      clientName: true,
      pipelineId: true,
      stage: true,
      stageId: true,
    },
    orderBy: { updatedAt: "desc" },
    take: 20,
  });
  if (deals.length === 0) return { status: "not_applicable", reason: "deal_not_found" };

  const currentStageIds = [...new Set(deals.map((deal) => deal.stageId).filter(Boolean))] as string[];
  const currentStages = currentStageIds.length > 0
    ? await params.database.pipelineStage.findMany({
        where: { id: { in: currentStageIds } },
        select: { id: true, name: true, pipelineId: true },
      })
    : [];
  const currentStageById = new Map(currentStages.map((stage) => [stage.id, stage]));
  const deal = deals.find((candidate) => {
    if (candidate.stageId) {
      return isNewLeadPipelineStage(currentStageById.get(candidate.stageId)?.name);
    }
    return isNewLeadPipelineStage(candidate.stage);
  });
  if (!deal) return { status: "not_applicable", reason: "deal_already_advanced" };

  const currentStage = deal.stageId ? currentStageById.get(deal.stageId) : null;
  const pipelineId = deal.pipelineId || currentStage?.pipelineId;
  if (!pipelineId) return { status: "not_applicable", reason: "pipeline_not_resolved" };

  const pipelineStages = await params.database.pipelineStage.findMany({
    where: { pipelineId },
    select: { id: true, name: true, position: true },
    orderBy: { position: "asc" },
  });
  const serviceStage = pipelineStages.find((stage) => normalizedPipelineStageName(stage.name) === "em_atendimento");
  if (!serviceStage) return { status: "not_applicable", reason: "service_stage_not_found" };

  const updated = await params.database.salesPipeline.updateMany({
    where: {
      id: deal.id,
      ...(deal.stageId
        ? { stageId: deal.stageId }
        : { stage: { in: ["novo_lead", "entrada"] } }),
    },
    data: {
      pipelineId,
      stageId: serviceStage.id,
      stage: "em_atendimento",
    },
  });
  if (updated.count !== 1) return { status: "not_applicable", reason: "deal_changed_concurrently" };

  await params.database.client.updateMany({
    where: { id: deal.clientId, isActive: true },
    data: { stage: "em_andamento" },
  });
  await params.database.auditLog.create({
    data: {
      userName: params.userName || "Sistema",
      action: "update",
      entity: "pipeline",
      entityId: deal.id,
      details: `Oportunidade "${deal.clientName}" movida automaticamente para estágio: em_atendimento ao iniciar o atendimento`,
      unit,
    },
  });

  return {
    status: "moved",
    dealId: deal.id,
    stageId: serviceStage.id,
    stageName: serviceStage.name,
    unit,
  };
}
