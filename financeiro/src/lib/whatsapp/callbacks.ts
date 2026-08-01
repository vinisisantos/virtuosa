import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { phoneLookupKey } from "@/lib/phone";
import { isDiscardPipelineStage, pipelineStageKeyFromName } from "@/lib/pipeline/stages";

export const WHATSAPP_CALLBACK_INTERVAL_MS = 12 * 60 * 60 * 1000;
export const WHATSAPP_CALLBACK_MAX_TEAM_ATTEMPTS = 6;
export const WHATSAPP_CALLBACK_LOST_STATUS = "lost";
export const WHATSAPP_CALLBACK_LOST_RESOLUTION = "callback_exhausted";

const CLOSED_CONVERSATION_STATUSES = ["closed", "resolved", WHATSAPP_CALLBACK_LOST_STATUS];

type CallbackTransaction = Prisma.TransactionClient;

export function nextWhatsAppCallbackDueAt(sentAt: Date) {
  return new Date(sentAt.getTime() + WHATSAPP_CALLBACK_INTERVAL_MS);
}

export async function recordInboundForCallbackTracking(
  tx: CallbackTransaction,
  conversationId: string,
  receivedAt: Date,
) {
  await tx.whatsAppConversation.update({
    where: { id: conversationId },
    data: {
      lastInboundAt: receivedAt,
      callbackDueAt: null,
      callbackTrackingStartedAt: receivedAt,
      callbackStreakCount: 0,
      callbackPipelineSyncedAt: null,
    },
  });

  // Uma resposta tardia do lead reabre somente perdas geradas por esta rotina.
  // Fechamentos manuais continuam intactos.
  await tx.whatsAppConversation.updateMany({
    where: {
      id: conversationId,
      status: WHATSAPP_CALLBACK_LOST_STATUS,
      resolution: WHATSAPP_CALLBACK_LOST_RESOLUTION,
    },
    data: {
      status: "open",
      resolution: null,
      closedAt: null,
      closedBy: null,
      closedByName: null,
    },
  });
}

export async function recordOutboundForCallbackTracking(
  tx: CallbackTransaction,
  conversationId: string,
  sentAt: Date,
) {
  const callbackDueAt = nextWhatsAppCallbackDueAt(sentAt);

  // O update condicional funciona como trava idempotente: se duas mensagens
  // forem enviadas juntas durante uma rechamada, apenas a primeira consome a
  // tentativa; a segunda já encontra o prazo renovado.
  const counted = await tx.whatsAppConversation.updateMany({
    where: {
      id: conversationId,
      callbackTrackingStartedAt: { not: null },
      callbackDueAt: { lte: sentAt },
      callbackStreakCount: { lt: WHATSAPP_CALLBACK_MAX_TEAM_ATTEMPTS },
      status: { notIn: CLOSED_CONVERSATION_STATUSES },
    },
    data: {
      lastOutboundAt: sentAt,
      callbackDueAt,
      callbackStreakCount: { increment: 1 },
      callbackTotalCount: { increment: 1 },
    },
  });

  if (counted.count === 0) {
    await tx.whatsAppConversation.updateMany({
      where: {
        id: conversationId,
        callbackTrackingStartedAt: { not: null },
        status: { notIn: CLOSED_CONVERSATION_STATUSES },
      },
      data: { lastOutboundAt: sentAt, callbackDueAt },
    });
  }

  return counted.count === 1;
}

function preferredClientForConversation<
  T extends { phone: string | null; unit: string; originUnit: string | null },
>(clients: T[], phone: string, unit: string | null) {
  const key = phoneLookupKey(phone);
  const exact = clients.filter((client) => phoneLookupKey(client.phone) === key);
  if (!unit) return exact[0] || null;
  return exact.find((client) => (client.originUnit || client.unit) === unit)
    || exact.find((client) => client.unit === unit)
    || exact[0]
    || null;
}

function preferredLostStage<T extends { name: string }>(stages: T[]) {
  return stages.find((stage) => pipelineStageKeyFromName(stage.name) === "sem_retorno")
    || stages.find((stage) => pipelineStageKeyFromName(stage.name) === "perdido")
    || stages.find((stage) => isDiscardPipelineStage(pipelineStageKeyFromName(stage.name)))
    || null;
}

export type WhatsAppCallbackProcessingResult = {
  checked: number;
  lost: number;
  pipelineUpdated: number;
  skipped: number;
};

export async function processExpiredWhatsAppCallbacks(
  now = new Date(),
  batchSize = 50,
): Promise<WhatsAppCallbackProcessingResult> {
  const expired = await prisma.whatsAppConversation.findMany({
    where: {
      callbackTrackingStartedAt: { not: null },
      callbackDueAt: { lte: now },
      callbackStreakCount: { gte: WHATSAPP_CALLBACK_MAX_TEAM_ATTEMPTS },
      callbackPipelineSyncedAt: null,
      status: { notIn: CLOSED_CONVERSATION_STATUSES },
    },
    select: {
      id: true,
      contact: { select: { phone: true, unit: true } },
      instance: { select: { unit: true } },
    },
    orderBy: { callbackDueAt: "asc" },
    take: Math.max(1, Math.min(batchSize, 100)),
  });

  const result: WhatsAppCallbackProcessingResult = {
    checked: expired.length,
    lost: 0,
    pipelineUpdated: 0,
    skipped: 0,
  };

  for (const conversation of expired) {
    const processed = await prisma.$transaction(async (tx) => {
      const claimed = await tx.whatsAppConversation.updateMany({
        where: {
          id: conversation.id,
          callbackDueAt: { lte: now },
          callbackStreakCount: { gte: WHATSAPP_CALLBACK_MAX_TEAM_ATTEMPTS },
          callbackPipelineSyncedAt: null,
          status: { notIn: CLOSED_CONVERSATION_STATUSES },
        },
        data: {
          status: WHATSAPP_CALLBACK_LOST_STATUS,
          resolution: WHATSAPP_CALLBACK_LOST_RESOLUTION,
          closeNote: "Sem resposta após 6 rechamadas em intervalos de 12 horas.",
          closedAt: now,
          closedByName: "Sistema · Rechamada",
          callbackDueAt: null,
        },
      });
      if (claimed.count === 0) return { processed: false, pipelineUpdated: false };

      const phoneKey = phoneLookupKey(conversation.contact.phone);
      const targetUnit = conversation.instance.unit && conversation.instance.unit !== "Todas"
        ? conversation.instance.unit
        : conversation.contact.unit || null;
      let pipelineUpdated = false;

      if (phoneKey) {
        const clients = await tx.client.findMany({
          where: {
            phone: { contains: phoneKey.slice(-4) },
            ...(targetUnit ? {
              OR: [
                { unit: targetUnit },
                { originUnit: targetUnit },
              ],
            } : {}),
          },
          select: { id: true, phone: true, unit: true, originUnit: true },
          orderBy: { updatedAt: "desc" },
          take: 100,
        });
        const client = preferredClientForConversation(clients, conversation.contact.phone, targetUnit);

        if (client) {
          const deals = await tx.salesPipeline.findMany({
            where: { clientId: client.id, ...(targetUnit ? { unit: targetUnit } : {}) },
            select: { id: true, pipelineId: true, stage: true, clientName: true, unit: true },
            orderBy: { updatedAt: "desc" },
            take: 20,
          });
          const deal = deals.find((candidate) => !isDiscardPipelineStage(candidate.stage)) || deals[0] || null;

          if (deal) {
            const stages = deal.pipelineId
              ? await tx.pipelineStage.findMany({
                  where: { pipelineId: deal.pipelineId },
                  select: { id: true, name: true },
                  orderBy: { position: "asc" },
                })
              : [];
            const lostStage = preferredLostStage(stages);
            const nextStage = lostStage ? pipelineStageKeyFromName(lostStage.name) : "sem_retorno";

            await tx.salesPipeline.update({
              where: { id: deal.id },
              data: {
                stage: nextStage,
                stageId: lostStage?.id || null,
                lostReason: "Sem resposta após 6 rechamadas",
                closedAt: now,
              },
            });
            await tx.auditLog.create({
              data: {
                userName: "Sistema · Rechamada",
                action: "update",
                entity: "pipeline",
                entityId: deal.id,
                details: `Oportunidade "${deal.clientName}" movida para Perdidos após 6 rechamadas sem resposta`,
                unit: deal.unit,
              },
            });
            pipelineUpdated = true;
          }

          await tx.client.update({ where: { id: client.id }, data: { stage: "nao_venda" } });
        }
      }

      await tx.whatsAppConversation.update({
        where: { id: conversation.id },
        data: { callbackPipelineSyncedAt: now },
      });
      return { processed: true, pipelineUpdated };
    });

    if (!processed.processed) {
      result.skipped += 1;
      continue;
    }
    result.lost += 1;
    if (processed.pipelineUpdated) result.pipelineUpdated += 1;
  }

  return result;
}
