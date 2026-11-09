import { after, NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUnitGuard } from "@/lib/unit-guard";
import { phoneLookupKey } from "@/lib/phone";
import { normalizeAppointmentClientName } from "@/lib/appointment-client-name";
import { getEvaluationAssigneeUsers, pipelineEvaluationMarker, upsertPipelineEvaluationAppointment } from "@/lib/evaluation-scheduling";
import { canAccessPipelineDeal, resolvePipelineOwnerScope } from "@/lib/pipeline-owner-scope";
import { getPipelineProcedureSelections } from "@/lib/pipeline/procedure-audit";
import { formatProcedureNames } from "@/lib/pipeline/procedure-names";
import { evaluationProcedureDraft } from "@/lib/evaluation-procedure-draft";
import { isDiscardPipelineStage, pipelineStageKeyFromName } from "@/lib/pipeline/stages";
import { pausesCommercialCallbacks } from "@/lib/pipeline/commercial-status";
import { recordPipelineScheduledStageEvent } from "@/lib/pipeline/scheduled-stage-events";
import { sendEvaluationScheduleConfirmation } from "@/lib/whatsapp/evaluation-schedule-confirmation";
import { dispatchEvaluationGroupNotice } from "@/lib/whatsapp/evaluation-group-notice";
import { selectSbcSchedulingExchange } from "@/lib/ai-assistant/sbc-scheduling-exchange";
import { validateAliceBookingClaim, type AliceBookingClaim } from "@/lib/ai-assistant/autonomy/booking-authorization";
import { ALICE_AUTONOMY_CONFIG_KEY, ALICE_AUTONOMY_INSTANCE_ID, ALICE_AUTONOMY_LEASE_MS, parseAliceAutonomyConfig } from "@/lib/ai-assistant/autonomy/policy";
import { AI_ASSISTANT_CONFIG_KEY, parseAiAssistantConfig } from "@/lib/ai-assistant/policy";

type RecentMessage = { id: string; body: string; status: string; fromMe: boolean; timestamp: Date; createdAt: Date };
export type AliceAutoScheduleResult =
  | { status: "not_applicable" }
  | { status: "review"; reason: string }
  | { status: "booked"; confirmation: "submitted" | "uncertain"; startTime: string };

const review = (reason: string): AliceAutoScheduleResult => ({ status: "review", reason });

function procedureFromConfirmedCampaign(campaignName: string | null, messages: RecentMessage[], offerId: string) {
  const candidate = evaluationProcedureDraft({ campaignName });
  if (!candidate) return null;
  const normalize = (text: string) => text.normalize("NFD").replace(/\p{Diacritic}/gu, "")
    .toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const campaign = normalize(candidate);
  if (campaign.length < 4) return null;
  const source = messages.slice(0, messages.findIndex((message) => message.id === offerId)).findLast((message) => !message.fromMe);
  return source && (` ${normalize(source.body)} `).includes(` ${campaign} `)
    ? { procedure: candidate, source } : null;
}

export function looksLikeSchedulingExchange(messages: RecentMessage[]) {
  return selectSbcSchedulingExchange(messages) !== null;
}

export async function tryAliceAutoSchedule(params: {
  req: NextRequest;
  unit: string;
  conversationId: string;
  instanceId: string;
  instanceUnit: string | null;
  contactUnit: string | null;
  phone: string | null;
  targetMessageId: string | null;
  messages: RecentMessage[];
  safetyHold: boolean;
  autonomyClaim?: AliceBookingClaim;
}): Promise<AliceAutoScheduleResult> {
  if (params.unit !== "SBC" || params.safetyHold || !params.instanceUnit || !["SBC", "Todas"].includes(params.instanceUnit)
    || (params.instanceUnit === "Todas" && params.contactUnit !== "SBC")) return { status: "not_applicable" };
  const exchange = selectSbcSchedulingExchange(params.messages);
  if (!exchange || (params.targetMessageId && params.targetMessageId !== exchange.reply.id)) return { status: "not_applicable" };
  const { offer, reply, replies, slot } = exchange;
  const activation = await prisma.appSetting.findUnique({ where: { key: "alice_auto_schedule_sbc_v1" }, select: { value: true } });
  let activatedAt: Date;
  try {
    const config = JSON.parse(activation?.value || "{}");
    activatedAt = new Date(config.activatedAt);
    if (config.enabled !== true || !Number.isFinite(activatedAt.getTime())
      || [offer, ...replies].some((message) => message.timestamp <= activatedAt || message.createdAt <= activatedAt)) return { status: "not_applicable" };
  } catch { return { status: "not_applicable" }; }
  if (!slot) return review("A escolha de data e horário precisa ser confirmada pela equipe antes do agendamento.");
  const autonomy = params.autonomyClaim;
  if (autonomy && (autonomy.sourceMessageId !== reply.id || !await validateAliceBookingClaim({
    claim: autonomy, conversationId: params.conversationId, instanceId: params.instanceId,
  }))) return review("A Alice não tem mais autorização para agendar nesta conversa.");
  const guard = autonomy ? null : requireUnitGuard(params.req, { requestedUnit: "SBC" });
  if (guard instanceof NextResponse) return review("Não foi possível verificar a permissão para agendar.");
  try { guard?.enforceUnit("SBC"); } catch { return review("Sem permissão para agendar nesta unidade."); }
  const phoneKey = phoneLookupKey(params.phone);
  if (!phoneKey || !/^\d{10,11}$/.test(phoneKey)) return review("Não foi possível identificar o telefone da cliente.");

  const clients = await prisma.client.findMany({
    where: { unit: "SBC", isActive: true, phone: { contains: phoneKey.slice(-8) } },
    select: { id: true, name: true, phone: true, campaignName: true }, take: 12,
  });
  const matches = clients.filter((client) => phoneLookupKey(client.phone) === phoneKey);
  if (matches.length !== 1) return review("Não foi possível identificar um único cadastro da cliente.");
  const client = matches[0];
  const clientName = normalizeAppointmentClientName(client.name);
  if (!clientName) return review("Informe o nome da cliente antes de agendar.");

  const [deals, assignees, scope] = await Promise.all([
    prisma.salesPipeline.findMany({ where: { unit: "SBC", clientId: client.id, closedAt: null, lostReason: null }, take: 3 }),
    getEvaluationAssigneeUsers("SBC"),
    guard ? resolvePipelineOwnerScope(params.req, guard) : null,
  ]);
  // A lease autoriza somente o cadastro SBC da conversa exata; não concede
  // acesso HTTP a funis de outro dono ou unidade.
  if (deals.length !== 1 || (!autonomy && (!scope || !(await canAccessPipelineDeal(deals[0], scope))))) return review("Não foi possível identificar uma única oportunidade acessível no funil.");
  const deal = deals[0];
  if (["agendado", "fechado"].includes(deal.stage) || isDiscardPipelineStage(deal.stage)) return review("A oportunidade já está agendada ou encerrada. Confira o funil antes de prosseguir.");
  if (pausesCommercialCallbacks(deal.commercialStatus)) return review("O atendimento está pausado no funil.");
  const gabrielas = assignees.filter((user) => {
    const name = user.name.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
    return /\bgabriela\b/u.test(name) && /\banselmo\b/u.test(name);
  });
  if (gabrielas.length !== 1) return review("Não foi possível identificar Gabriela Anselmo como responsável ativa em SBC.");
  const procedureNames = (await getPipelineProcedureSelections(prisma, [deal.id])).get(deal.id) || [];
  const campaignProcedure = procedureNames.length ? null : procedureFromConfirmedCampaign(client.campaignName, params.messages, offer.id);
  const procedure = formatProcedureNames(procedureNames) || campaignProcedure?.procedure;
  if (!procedure) return review("Informe o procedimento de interesse antes de agendar.");
  const pipeline = deal.pipelineId ? await prisma.pipeline.findUnique({
    where: { id: deal.pipelineId }, include: { stages: { orderBy: { position: "asc" } } },
  }) : null;
  const stage = pipeline?.stages.find((item) => pipelineStageKeyFromName(item.name) === "agendado");
  if (!stage) return review("Não foi encontrada a etapa Agendado no funil da cliente.");

  const booked = await prisma.$transaction(async (tx) => {
    if (autonomy) {
      const settings = await tx.$queryRaw<{ key: string; value: string }[]>`
        SELECT "key", "value" FROM "AppSetting" WHERE "key" IN (${ALICE_AUTONOMY_CONFIG_KEY},${AI_ASSISTANT_CONFIG_KEY}) ORDER BY "key" FOR SHARE`;
      if (params.instanceId !== ALICE_AUTONOMY_INSTANCE_ID
        || !parseAliceAutonomyConfig(settings.find((item) => item.key === ALICE_AUTONOMY_CONFIG_KEY)?.value).enabled
        || !parseAiAssistantConfig(settings.find((item) => item.key === AI_ASSISTANT_CONFIG_KEY)?.value).enabled) return null;
    }
    const lockedConversations = await tx.$queryRaw<{ instanceId: string; contactId: string; aiMode: string; blockedAt: Date | null; archivedAt: Date | null; status: string }[]>`
      SELECT "instanceId", "contactId", "aiMode", "blockedAt", "archivedAt", "status"
      FROM "WhatsAppConversation" WHERE "id" = ${params.conversationId} FOR UPDATE`;
    const locked = lockedConversations[0];
    if (!locked || locked.instanceId !== params.instanceId || locked.aiMode !== (autonomy ? "agent" : "suggestions")
      || locked.blockedAt || locked.archivedAt || ["closed", "resolved", "lost"].includes(locked.status)) return null;
    if (autonomy) {
      const lease = await tx.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "AliceAutonomousTurn" WHERE "id"=${autonomy.turnId}
          AND "conversationId"=${params.conversationId} AND "instanceId"=${params.instanceId}
          AND "sourceMessageId"=${reply.id} AND "claimToken"=${autonomy.claimToken}
          AND "status"='processing' AND "claimedAt">=NOW()-(${ALICE_AUTONOMY_LEASE_MS} * interval '1 millisecond') FOR UPDATE`;
      if (!lease.length) return null;
    }
    const instances = await tx.$queryRaw<{ unit: string }[]>`SELECT "unit" FROM "WhatsAppInstance" WHERE "id" = ${locked.instanceId} FOR SHARE`;
    const instance = instances[0];
    if (!instance || instance.unit !== params.instanceUnit) return null;
    const contacts = await tx.$queryRaw<{ phone: string; unit: string | null }[]>`SELECT "phone", "unit" FROM "WhatsAppContact" WHERE "id" = ${locked.contactId} FOR SHARE`;
    if (!contacts[0] || phoneLookupKey(contacts[0].phone) !== phoneKey || (instance.unit === "Todas" && contacts[0].unit !== "SBC")) return null;
    const settings = await tx.$queryRaw<{ value: string }[]>`
      SELECT "value" FROM "AppSetting" WHERE "key" = 'alice_auto_schedule_sbc_v1' FOR SHARE`;
    if (!activation || settings[0]?.value !== activation.value) return null;
    const latestAny = await tx.whatsAppMessage.findFirst({
      where: { conversationId: params.conversationId, status: { not: "deleted" } },
      select: { id: true }, orderBy: [{ timestamp: "desc" }, { id: "desc" }],
    });
    if (latestAny?.id !== reply.id) return null;
    const messages = await tx.whatsAppMessage.findMany({
      where: { conversationId: params.conversationId, status: { not: "deleted" } },
      select: { id: true, body: true, type: true, status: true, fromMe: true, timestamp: true, createdAt: true },
      orderBy: [{ timestamp: "desc" }, { id: "desc" }], take: 30,
    });
    const currentExchange = selectSbcSchedulingExchange(messages.reverse());
    if (!currentExchange || currentExchange.reply.id !== reply.id || currentExchange.offer.id !== offer.id
      || currentExchange.slot !== slot || currentExchange.asksEvaluationCost !== exchange.asksEvaluationCost
      || currentExchange.replies.length !== replies.length
      || [currentExchange.offer, ...currentExchange.replies].some((message, index) => {
        const original = [offer, ...replies][index];
        return message.id !== original.id || message.body !== original.body
          || message.timestamp <= activatedAt || message.createdAt <= activatedAt;
      })) return null;
    const previous = await tx.aliceAutoSchedule.findUnique({ where: { conversationId_replyMessageId: { conversationId: params.conversationId, replyMessageId: reply.id } } });
    if (previous) return null;
    const currentClients = await tx.$queryRaw<{ name: string; phone: string | null; unit: string; isActive: boolean; campaignName: string | null }[]>`
      SELECT "name", "phone", "unit", "isActive", "campaignName" FROM "Client" WHERE "id" = ${client.id} FOR UPDATE`;
    const currentClient = currentClients[0];
    if (!currentClient?.isActive || currentClient.unit !== "SBC" || phoneLookupKey(currentClient.phone) !== phoneKey
      || normalizeAppointmentClientName(currentClient.name) !== clientName
      || (!procedureNames.length && currentClient.campaignName !== client.campaignName)) return null;
    if (campaignProcedure) {
      const source = await tx.whatsAppMessage.findFirst({
        where: { id: campaignProcedure.source.id, conversationId: params.conversationId, fromMe: false, type: "text", status: { not: "deleted" }, body: campaignProcedure.source.body },
        select: { id: true },
      });
      if (!source) return null;
    }
    const existing = await tx.agendamento.findFirst({
      where: { unit: "SBC", procedimento: { contains: "avalia", mode: "insensitive" }, notes: { contains: pipelineEvaluationMarker(deal.id) } },
      select: { id: true },
    });
    if (existing) return null;
    const changed = await tx.salesPipeline.updateMany({
      where: { id: deal.id, unit: "SBC", updatedAt: deal.updatedAt, closedAt: null, lostReason: null },
      data: { stage: "agendado", stageId: stage.id, clientName },
    });
    if (!changed.count) return null;
    const appointment = await upsertPipelineEvaluationAppointment({
      deal: { id: deal.id, clientName, unit: "SBC", notes: deal.notes },
      clientPhone: params.phone, startTime: new Date(`${slot}:00-03:00`),
      assigneeUserId: gabrielas[0].id, evaluationProcedure: procedure, sourceInstanceId: params.instanceId,
      rejectExistingAppointment: true,
    }, tx);
    await recordPipelineScheduledStageEvent(tx, { dealId: deal.id, clientName, unit: "SBC", userName: guard?.userName || "Alice" });
    await tx.client.updateMany({ where: { id: client.id, unit: "SBC" }, data: { stage: "em_andamento" } });
    await tx.aliceAutoSchedule.create({ data: {
      conversationId: params.conversationId, offerMessageId: offer.id, replyMessageId: reply.id,
      appointmentId: appointment.id, state: "sending",
    } });
    return { appointment, clientName };
  }, { timeout: 20_000 });
  if (!booked) return review("A conversa ou a agenda mudou, ou já existe uma avaliação. Confira antes de agendar.");

  if (booked.appointment.evaluationGroupNoticeId) {
    const noticeId = booked.appointment.evaluationGroupNoticeId;
    try { after(async () => { await dispatchEvaluationGroupNotice(noticeId); }); }
    catch (error) { console.error("[Alice] Aviso de grupo permaneceu na fila:", error); }
  }
  const confirmation = await sendEvaluationScheduleConfirmation({
    request: params.req, unit: "SBC", instanceId: params.instanceId, conversationId: params.conversationId,
    clientName: booked.clientName, clientPhone: params.phone, startTime: booked.appointment.startTime, allowAuthorizedSbcInstance: true,
    requireProviderMessageId: true,
    autonomyClaim: autonomy,
    evaluationCostQuestion: exchange.asksEvaluationCost,
  });
  const confirmationState = confirmation.status === "sent" ? "submitted" : "uncertain";
  try {
    await prisma.aliceAutoSchedule.updateMany({
      where: { conversationId: params.conversationId, replyMessageId: reply.id, state: "sending" },
      data: { state: confirmationState },
    });
    return { status: "booked", confirmation: confirmationState, startTime: booked.appointment.startTime.toISOString() };
  } catch (error) {
    console.error("[Alice] Resultado da confirmação não pôde ser registrado:", error);
    return { status: "booked", confirmation: "uncertain", startTime: booked.appointment.startTime.toISOString() };
  }
}
