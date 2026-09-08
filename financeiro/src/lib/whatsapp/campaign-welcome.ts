import { randomUUID } from "node:crypto";
import type { WhatsAppWelcomeJob } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { savedReplyCampaignKey } from "@/lib/whatsapp/saved-replies";
import { sendAutomationText } from "@/lib/whatsapp/automation-sender";
import { WELCOME_AUTHOR, WELCOME_DELAY_MS, WELCOME_LIBRARY_USER_ID, welcomeConfig, welcomePair, welcomeUnit, type WelcomeReply } from "@/lib/whatsapp/campaign-welcome-policy";
import { claimWelcomeQuery, finishWelcomeQuery, welcomeContextQuery, welcomeReceptionQuery } from "@/lib/whatsapp/campaign-welcome-query";

type Database = typeof prisma;
type ReceptionInput = Parameters<typeof welcomeReceptionQuery>[0];
export async function findWelcomeReception(input: ReceptionInput, database: Database = prisma) {
  const rows = await database.$queryRaw<Array<{ id: string; isActive: boolean }>>(welcomeReceptionQuery(input));
  return rows[0] || null;
}

export async function enqueueWelcome(input: ReceptionInput & { contactPhone: string }, database: Database = prisma) {
  // Revalida a primeira entrada na escrita. Replay usa a mesma reserva; não há varredura retroativa.
  return database.$executeRaw(Prisma.sql`
    INSERT INTO "WhatsAppWelcomeJob" (id, "conversationId", "clientId", "automationId", "instanceId", unit, "contactPhone", "inboundMessageId", "dueAt")
    SELECT ${randomUUID()}, c.id, ${input.clientId}, eligible.id, c."instanceId", ${input.unit}, ${input.contactPhone}, ${input.messageId}, c."createdAt" + ${WELCOME_DELAY_MS} * interval '1 millisecond'
    FROM (${welcomeReceptionQuery(input)}) eligible
    JOIN "WhatsAppConversation" c ON c.id = ${input.conversationId}
    JOIN "WhatsAppMessage" m ON m."conversationId" = c.id AND m."messageId" = ${input.messageId} AND NOT m."fromMe"
    WHERE eligible."isActive" ON CONFLICT ("conversationId") DO NOTHING`);
}

export type WelcomeContext = WhatsAppWelcomeJob & {
  enabled: boolean; triggerConfig: unknown; currentConfigUpdatedAt: Date; campaignName: string | null;
  clientUnit: string; clientActive: boolean; blockedAt: Date | null; archivedAt: Date | null; closedAt: Date | null;
  conversationStatus: string; lastKnownJid: string | null; currentPhone: string; instanceName: string;
  provider: string; instanceStatus: string; instanceUnit: string | null; capturesLeads: boolean;
  hasOtherOutbound: boolean; hasReply: boolean; leftInitialStage: boolean; hasAppointment: boolean;
  currentReplyUserId: string | null; currentCategoryUserId: string | null;
  currentCategoryTitle: string | null; currentCategoryCampaign: string | null;
};
export function welcomeCancellation(context: WelcomeContext, now = new Date()) {
  if (!context.enabled) return "automation_paused";
  if (!welcomeUnit(context.unit, context.instanceId) || context.instanceUnit !== context.unit || context.clientUnit !== context.unit) return "unit_changed";
  if (!context.clientActive || !context.capturesLeads || context.currentPhone !== context.contactPhone) return "contact_changed";
  if (context.blockedAt || context.archivedAt || context.closedAt || ['closed', 'resolved', 'lost'].includes(context.conversationStatus)) return "conversation_closed_or_blocked";
  if (context.hasAppointment || context.leftInitialStage) return "lead_already_attended_or_scheduled";
  if (context.hasOtherOutbound) return "attendant_or_other_automation_replied";
  if (context.hasReply) return "lead_replied_after_greeting";
  if (now.getTime() - context.createdAt.getTime() > 15 * 60_000) return "reception_expired";
  if (context.configUpdatedAt && context.configUpdatedAt.getTime() !== context.currentConfigUpdatedAt.getTime()) return "configuration_changed";
  if (context.campaignKey !== null && context.campaignKey !== savedReplyCampaignKey(context.campaignName || "")) return "campaign_changed";
  if (context.replyId && (context.currentReplyUserId !== WELCOME_LIBRARY_USER_ID || context.currentCategoryUserId !== WELCOME_LIBRARY_USER_ID
    || savedReplyCampaignKey(context.currentCategoryCampaign?.trim() || context.currentCategoryTitle || '') !== context.campaignKey)) return "reply_category_changed";
  return null;
}

class WelcomeCancelled extends Error {}

export async function processCampaignWelcomes(deps: {
  database?: Database; send?: typeof sendAutomationText; now?: () => Date; budgetMs?: number;
  onError?: (error: unknown) => void;
} = {}) {
  const database = deps.database || prisma;
  const send = deps.send || sendAutomationText;
  const now = deps.now || (() => new Date());
  const deadline = now().getTime() + (deps.budgetMs ?? 45_000);
  const results: Record<string, number> = {};
  const count = (status: string) => { results[status] = (results[status] || 0) + 1; };
  const seen = new Set<string>();
  // Uma interrupção ANTES do envio pode ser retomada; depois de iniciar HTTP é incerta.
  await database.$executeRaw`UPDATE "WhatsAppWelcomeJob" SET status = 'pending', "claimToken" = NULL, "updatedAt" = now()
    WHERE status = 'processing' AND "claimedAt" < now() - interval '2 minutes'`;
  const stale = await database.whatsAppWelcomeJob.findMany({ where: { status: 'sending', claimedAt: { lt: new Date(now().getTime() - 120_000) } }, take: 6 });
  for (const job of stale) await database.$executeRaw(finishWelcomeQuery(job.id, job.claimToken!, 'uncertain', 'interrupted_after_send_started'));
  const replies = await database.whatsAppSavedReply.findMany({
    where: { userId: WELCOME_LIBRARY_USER_ID }, take: 100,
    select: { id: true, userId: true, title: true, content: true, category: { select: { userId: true, title: true, campaignName: true } } },
  });

  // Até seis etapas (três pares) por invocação. Cada chamada ao provedor tem timeout de 15s.
  for (let step = 0; step < 6 && now().getTime() < deadline - 20_000; step++) {
    const token = randomUUID();
    const jobs = await database.$queryRaw<WhatsAppWelcomeJob[]>(claimWelcomeQuery(token, now(), seen.size >= 3 ? [...seen] : undefined));
    const job = jobs[0];
    if (!job) break;
    seen.add(job.id);
    const finish = async (status: string, reason: string | null, receipt?: { messageId: string; sentAt: Date }) => {
      await database.$executeRaw(finishWelcomeQuery(job.id, token, status, reason, receipt));
      count(status);
    };
    let sendStarted = false;
    try {
      const [context] = await database.$queryRaw<WelcomeContext[]>(welcomeContextQuery(job.id));
      if (!context) { await finish('cancelled', 'context_missing'); continue; }
      const reason = welcomeCancellation(context, now());
      if (reason) { await finish('cancelled', reason); continue; }
      if (context.instanceStatus !== 'connected') {
        await database.whatsAppWelcomeJob.updateMany({ where: { id: job.id, claimToken: token, status: 'processing' }, data: { status: 'pending', dueAt: new Date(now().getTime() + 60_000) } });
        count('waiting_connection'); continue;
      }
      const pair = welcomePair(welcomeConfig(context.triggerConfig), context.campaignName, replies as WelcomeReply[], context.unit);
      if (job.phase === 0) {
        await database.whatsAppWelcomeJob.updateMany({ where: { id: job.id, claimToken: token, status: 'processing' }, data: {
          greeting: pair.greeting, question: pair.question, replyId: pair.replyId,
          campaignKey: pair.campaignKey, configUpdatedAt: context.currentConfigUpdatedAt,
        } });
      } else if (!job.greetingMessageId || !job.greetingSentAt || !job.question || pair.replyId !== job.replyId) {
        await finish('cancelled', 'second_message_unavailable'); continue;
      }
      const receipt = await send({
        dbInstance: { name: context.instanceName, provider: context.provider }, conversationId: job.conversationId,
        contactPhone: context.contactPhone, lastKnownJid: context.lastKnownJid,
        message: job.phase === 0 ? pair.greeting : job.question!, respondedByName: WELCOME_AUTHOR,
        providerTimeoutMs: 15_000, requireProviderMessageId: true,
        beforeSend: async () => {
          const [latest] = await database.$queryRaw<WelcomeContext[]>(welcomeContextQuery(job.id));
          const reason = latest ? welcomeCancellation(latest, now()) : 'context_missing';
          if (reason || latest.instanceStatus !== 'connected') throw new WelcomeCancelled(reason || 'instance_disconnected');
          const claim = await database.whatsAppWelcomeJob.updateMany({ where: { id: job.id, claimToken: token, status: 'processing' }, data: { status: 'sending', claimedAt: now() } });
          if (claim.count !== 1) throw new WelcomeCancelled('claim_lost');
          sendStarted = true;
        },
      });
      if (job.phase === 0) {
        await database.whatsAppWelcomeJob.updateMany({ where: { id: job.id, claimToken: token, status: 'sending' }, data: {
          greetingMessageId: receipt.messageId, greetingSentAt: receipt.sentAt,
          ...(pair.question ? { status: 'pending', phase: 1, dueAt: now() } : {}),
        } });
        if (!pair.question) await finish('greeting_only', 'campaign_question_missing');
        else count('greeting_sent');
      } else await finish('completed', null, receipt);
    } catch (error) {
      deps.onError?.(error);
      // HTTP pode ter sido aceito mesmo quando não recebemos/persistimos a resposta.
      // Nunca reenviar automaticamente nesse caso.
      await finish(sendStarted ? 'uncertain' : 'cancelled', error instanceof WelcomeCancelled ? error.message : sendStarted ? 'provider_or_persistence_uncertain' : 'invalid_configuration_or_context');
    }
  }
  return results;
}
