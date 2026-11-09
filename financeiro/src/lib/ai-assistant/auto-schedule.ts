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
import { deriveSbcEvaluationChoice } from "@/lib/ai-assistant/sbc-scheduling-policy";

type RecentMessage = { id: string; body: string; status: string; fromMe: boolean; timestamp: Date; createdAt: Date };
export type AliceAutoScheduleResult =
  | { status: "not_applicable" }
  | { status: "review"; reason: string }
  | { status: "booked"; confirmation: "submitted" | "uncertain"; startTime: string };

const review = (reason: string): AliceAutoScheduleResult => ({ status: "review", reason });

function procedureFromConfirmedCampaign(campaignName: string | null, messages: RecentMessage[]) {
  const candidate = evaluationProcedureDraft({ campaignName });
  if (!candidate) return null;
  const normalize = (text: string) => text.normalize("NFD").replace(/\p{Diacritic}/gu, "")
    .toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const campaign = normalize(candidate);
  if (campaign.length < 4) return null;
  const source = messages.slice(0, -2).findLast((message) => !message.fromMe);
  return source && (` ${normalize(source.body)} `).includes(` ${campaign} `)
    ? { procedure: candidate, source } : null;
}

export function looksLikeSchedulingExchange(messages: RecentMessage[]) {
  const reply = messages.at(-1);
  const offer = messages.at(-2);
  if (!reply || !offer || reply.fromMe || !offer.fromMe) return false;
  const normalizedReply = reply.body.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  const looksLikeAcceptance = /^(sim|pode|ok|certo|combinado|confirmo|fechado|(?:as\s*)?\d{1,2}(?:h|:))\b/u.test(normalizedReply.trim());
  return looksLikeAcceptance && /\b\d{1,2}\/\d{1,2}\b/u.test(offer.body) && /\b\d{1,2}(?:h|:\d{2})/iu.test(offer.body);
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
}): Promise<AliceAutoScheduleResult> {
  if (params.unit !== "SBC" || params.safetyHold || !params.instanceUnit || !["SBC", "Todas"].includes(params.instanceUnit)
    || (params.instanceUnit === "Todas" && params.contactUnit !== "SBC")) return { status: "not_applicable" };
  const reply = params.messages.at(-1);
  const offer = params.messages.at(-2);
  if (!reply || !offer || reply.fromMe || !offer.fromMe || (params.targetMessageId && params.targetMessageId !== reply.id)) return { status: "not_applicable" };
  const slot = deriveSbcEvaluationChoice({ offer, reply, now: new Date() });
  if (!slot && !looksLikeSchedulingExchange(params.messages)) return { status: "not_applicable" };
  const activation = await prisma.appSetting.findUnique({ where: { key: "alice_auto_schedule_sbc_v1" }, select: { value: true } });
  let activatedAt: Date;
  try {
    const config = JSON.parse(activation?.value || "{}");
    activatedAt = new Date(config.activatedAt);
    if (config.enabled !== true || !Number.isFinite(activatedAt.getTime())
      || offer.timestamp <= activatedAt || offer.createdAt <= activatedAt || reply.timestamp <= activatedAt || reply.createdAt <= activatedAt) return { status: "not_applicable" };
  } catch { return { status: "not_applicable" }; }
  if (!slot) return review("A escolha de data e horário precisa ser confirmada pela equipe antes do agendamento.");
  const guard = requireUnitGuard(params.req, { requestedUnit: "SBC" });
  if (guard instanceof NextResponse) return review("Não foi possível verificar a permissão para agendar.");
  try { guard.enforceUnit("SBC"); } catch { return review("Sem permissão para agendar nesta unidade."); }
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
    resolvePipelineOwnerScope(params.req, guard),
  ]);
  if (deals.length !== 1 || !(await canAccessPipelineDeal(deals[0], scope))) return review("Não foi possível identificar uma única oportunidade acessível no funil.");
  const deal = deals[0];
  if (["agendado", "fechado"].includes(deal.stage) || isDiscardPipelineStage(deal.stage)) return review("A oportunidade já está agendada ou encerrada. Confira o funil antes de prosseguir.");
  if (pausesCommercialCallbacks(deal.commercialStatus)) return review("O atendimento está pausado no funil.");
  const gabrielas = assignees.filter((user) => {
    const name = user.name.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
    return /\bgabriela\b/u.test(name) && /\banselmo\b/u.test(name);
  });
  if (gabrielas.length !== 1) return review("Não foi possível identificar Gabriela Anselmo como responsável ativa em SBC.");
  const procedureNames = (await getPipelineProcedureSelections(prisma, [deal.id])).get(deal.id) || [];
  const campaignProcedure = procedureNames.length ? null : procedureFromConfirmedCampaign(client.campaignName, params.messages);
  const procedure = formatProcedureNames(procedureNames) || campaignProcedure?.procedure;
  if (!procedure) return review("Informe o procedimento de interesse antes de agendar.");
  const pipeline = deal.pipelineId ? await prisma.pipeline.findUnique({
    where: { id: deal.pipelineId }, include: { stages: { orderBy: { position: "asc" } } },
  }) : null;
  const stage = pipeline?.stages.find((item) => pipelineStageKeyFromName(item.name) === "agendado");
  if (!stage) return review("Não foi encontrada a etapa Agendado no funil da cliente.");

  const booked = await prisma.$transaction(async (tx) => {
    const lockedConversations = await tx.$queryRaw<{ instanceId: string; contactId: string; aiMode: string; blockedAt: Date | null; archivedAt: Date | null; status: string }[]>`
      SELECT "instanceId", "contactId", "aiMode", "blockedAt", "archivedAt", "status"
      FROM "WhatsAppConversation" WHERE "id" = ${params.conversationId} FOR UPDATE`;
    const locked = lockedConversations[0];
    if (!locked || locked.instanceId !== params.instanceId || locked.aiMode !== "suggestions"
      || locked.blockedAt || locked.archivedAt || ["closed", "resolved", "lost"].includes(locked.status)) return null;
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
      where: { conversationId: params.conversationId, type: "text", status: { not: "deleted" }, body: { not: "" } },
      select: { id: true, body: true, status: true, fromMe: true, timestamp: true, createdAt: true },
      orderBy: [{ timestamp: "desc" }, { id: "desc" }], take: 2,
    });
    if (messages[0]?.id !== reply.id || messages[1]?.id !== offer.id
      || messages[0].timestamp <= activatedAt || messages[0].createdAt <= activatedAt
      || messages[1].timestamp <= activatedAt || messages[1].createdAt <= activatedAt
      || deriveSbcEvaluationChoice({ offer: messages[1], reply: messages[0], now: new Date() }) !== slot) return null;
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
    await recordPipelineScheduledStageEvent(tx, { dealId: deal.id, clientName, unit: "SBC", userName: guard.userName || "Alice" });
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
