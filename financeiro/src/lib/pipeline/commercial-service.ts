import { Prisma, type SalesPipeline } from "@prisma/client";
import { prisma } from "@/lib/db";
import { phoneLookupKey } from "@/lib/phone";
import { getInstancesForRequest } from "@/lib/whatsapp/instance-resolver";
import type { UnitGuardResult } from "@/lib/unit-guard";
import { isDiscardPipelineStage, pipelineStageKeyFromName } from "@/lib/pipeline/stages";
import { commercialLabel, commercialReasonLabel, isCommercialClosed, pausesCommercialCallbacks, validateCommercialDraft } from "@/lib/pipeline/commercial-status";

export class CommercialError extends Error {}

export async function refreshCommercialPauses(tx: Prisma.TransactionClient, ids: string[]) {
  if (!ids.length) return;
  await tx.$executeRaw`
    UPDATE "WhatsAppConversation" c SET
      "commercialPaused" = EXISTS (SELECT 1 FROM "PipelineCommercialHold" h WHERE h."conversationId" = c.id),
      "callbackDueAt" = NULL,
      "callbackStreakCount" = CASE WHEN c."commercialPaused" AND NOT EXISTS
        (SELECT 1 FROM "PipelineCommercialHold" h WHERE h."conversationId" = c.id) THEN 0 ELSE c."callbackStreakCount" END,
      "callbackPipelineSyncedAt" = CASE WHEN NOT EXISTS
        (SELECT 1 FROM "PipelineCommercialHold" h WHERE h."conversationId" = c.id) THEN NULL ELSE c."callbackPipelineSyncedAt" END,
      "updatedAt" = NOW()
    WHERE c.id IN (${Prisma.join(ids)})
      AND (c."commercialPaused" OR EXISTS (SELECT 1 FROM "PipelineCommercialHold" h WHERE h."conversationId" = c.id))
  `;
}

export async function saveCommercialClassification(params: {
  req: Request; guard: UnitGuardResult; existing: SalesPipeline; phone: string | null;
  draft: unknown; expectedUpdatedAt: unknown;
}) {
  const { existing, guard } = params;
  const validation = validateCommercialDraft(params.draft);
  if ("error" in validation) throw new CommercialError(validation.error);
  const change = validation.data;
  if (existing.stage === "fechado") throw new CommercialError("Uma venda fechada não pode ser reclassificada como lead");
  if (params.expectedUpdatedAt !== existing.updatedAt.toISOString()) {
    throw new CommercialError("Este negócio foi atualizado. Reabra o cartão antes de classificar");
  }
  const requestUrl = new URL(params.req.url);
  requestUrl.searchParams.set("unit", existing.unit);
  // Sem seletor explícito, o administrador atua na caixa do responsável do negócio.
  if (guard.isAdmin && !requestUrl.searchParams.has("targetInstanceId") && !requestUrl.searchParams.has("targetUserId") && existing.assignedTo) {
    requestUrl.searchParams.set("targetUserId", existing.assignedTo);
  }
  const { instances } = await getInstancesForRequest(new Request(requestUrl, { headers: params.req.headers }));
  const writable = instances.filter((instance) => instance.canReply && instance.status !== "archived" && [existing.unit, "Todas"].includes(instance.unit || ""));
  if (instances.length && !writable.length) throw new CommercialError("Esta caixa está disponível somente para leitura ou pertence a outra unidade");
  const phoneKey = phoneLookupKey(params.phone);
  const conversations = phoneKey && writable.length ? await prisma.whatsAppConversation.findMany({
    where: {
      instanceId: { in: writable.map((instance) => instance.id) },
      contact: { phone: { contains: phoneKey.slice(-8) } },
      OR: [{ instance: { unit: existing.unit } }, { instance: { unit: "Todas" }, contact: { unit: existing.unit } }],
    },
    select: { id: true, instanceId: true, assignedTo: true, contact: { select: { phone: true } } },
  }) : [];
  const ids = conversations.filter((conversation) => phoneLookupKey(conversation.contact.phone) === phoneKey
    && (!conversation.assignedTo || conversation.assignedTo === guard.userId
      || writable.find((instance) => instance.id === conversation.instanceId)?.canManage)).map((conversation) => conversation.id);
  const oldHolds = await prisma.pipelineCommercialHold.findMany({ where: { dealId: existing.id }, select: { conversationId: true } });
  // Não liberar pausas em uma caixa à qual o operador perdeu acesso.
  const accessibleOld = oldHolds.filter((hold) => ids.includes(hold.conversationId));
  if (oldHolds.length !== accessibleOld.length) throw new CommercialError("A pausa está vinculada a outra caixa. Selecione a instância responsável para alterar");

  const closing = isCommercialClosed(change.commercialStatus);
  const reopening = isDiscardPipelineStage(existing.stage) && !closing;
  const stages = (closing || reopening) && existing.pipelineId ? await prisma.pipelineStage.findMany({
    where: { pipelineId: existing.pipelineId }, select: { id: true, name: true }, orderBy: { position: "asc" },
  }) : [];
  const targetStage = closing
    ? stages.find((stage) => isDiscardPipelineStage(pipelineStageKeyFromName(stage.name)))
    : reopening ? stages.find((stage) => pipelineStageKeyFromName(stage.name) === "em_atendimento") : undefined;
  if ((closing || reopening) && !targetStage) throw new CommercialError("Configure as etapas Em Atendimento e Encerrado deste funil antes de classificar");
  const paused = pausesCommercialCallbacks(change.commercialStatus);
  const updated = await prisma.$transaction(async (tx) => {
    // Mesma ordem de lock do cron: conversa antes do negócio. Evita perda concorrente.
    if (ids.length) await tx.$queryRaw`SELECT id FROM "WhatsAppConversation" WHERE id IN (${Prisma.join(ids)}) ORDER BY id FOR UPDATE`;
    const saved = await tx.salesPipeline.updateMany({
      where: { id: existing.id, updatedAt: existing.updatedAt },
      data: {
        ...change,
        assignedTo: existing.assignedTo || guard.userId,
        assignedName: existing.assignedName || guard.userName,
        ...(targetStage ? { stageId: targetStage.id, stage: pipelineStageKeyFromName(targetStage.name) } : {}),
        ...(closing ? { closedAt: new Date(), lostReason: commercialReasonLabel(change.commercialReason) }
          : reopening ? { closedAt: null, lostReason: null } : {}),
      },
    });
    if (saved.count !== 1) throw new CommercialError("O negócio mudou durante a operação. Atualize e tente novamente");
    await tx.pipelineCommercialHold.deleteMany({ where: { dealId: existing.id } });
    if (paused && ids.length) await tx.pipelineCommercialHold.createMany({
      data: ids.map((conversationId) => ({ dealId: existing.id, conversationId })), skipDuplicates: true,
    });
    await refreshCommercialPauses(tx, ids);
    if (closing || reopening) await tx.client.updateMany({ where: { id: existing.clientId, unit: existing.unit }, data: { stage: closing ? "nao_venda" : "em_andamento" } });
    await tx.auditLog.create({ data: {
      userName: guard.userName, action: "update", entity: "pipeline", entityId: existing.id, unit: existing.unit,
      details: JSON.stringify({ action: "commercial_classification", previous: { status: existing.commercialStatus, reason: existing.commercialReason, note: existing.commercialNote, nextContactAt: existing.nextContactAt },
        next: change, label: commercialLabel(change.commercialStatus), linkedConversations: ids.length }),
    } });
    return tx.salesPipeline.findUniqueOrThrow({ where: { id: existing.id } });
  });
  return { ...updated, commercialLinkedConversations: ids.length };
}
