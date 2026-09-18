import { NextRequest, NextResponse } from "next/server";
import { requireAuth, hasPermission } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { canManageAllEvaluations, isOwnEvaluation } from "@/lib/evaluation-access";
import { getPipelineDealIdFromEvaluationNotes } from "@/lib/evaluation-scheduling";
import { requireUnitGuard, UnitAccessDeniedError, unitAccessDeniedResponse } from "@/lib/unit-guard";
import { createConversationForInstance, findConversationByPhone, normalizePhoneForWhatsApp } from "@/lib/whatsapp/conversation-starter";
import { getEvaluationScheduleUnitConfigByUnit } from "@/lib/whatsapp/evaluation-schedule-confirmation-message";
import { getInstancesForRequest } from "@/lib/whatsapp/instance-resolver";
import { getEvaluationConfirmation, sendEvaluationConfirmation, type EvaluationConfirmationContext } from "@/lib/whatsapp/evaluation-confirmation-handler";

export const maxDuration = 60;
type RouteContext = { params: Promise<{ id: string }> };

function unavailable(reason: string, message: string) {
  return NextResponse.json({ visible: false, alreadySent: false, reason, error: message }, { status: 409 });
}

function validPhone(value: string | null | undefined) {
  const raw = (value || "").trim();
  const digits = raw.replace(/\D/g, "");
  const national = digits.startsWith("55") && digits.length > 11 ? digits.slice(2) : digits;
  return /^[+\d\s().-]+$/.test(raw) && /^[1-9]{2}[2-9]\d{7,8}$/.test(national)
    ? normalizePhoneForWhatsApp(raw) : null;
}

async function resolveAppointment(req: NextRequest, id: string): Promise<EvaluationConfirmationContext | NextResponse> {
  const guard = requireUnitGuard(req);
  if (guard instanceof NextResponse) return guard;
  const appointment = await prisma.agendamento.findUnique({
    where: { id },
    select: { id: true, unit: true, clientName: true, clientPhone: true, startTime: true,
      procedimento: true, status: true, notes: true, profissional: { select: { name: true } } },
  });
  if (!appointment) return NextResponse.json({ error: "Avaliação não encontrada." }, { status: 404 });
  try { guard.enforceUnit(appointment.unit); } catch (error) {
    if (error instanceof UnitAccessDeniedError) return unitAccessDeniedResponse();
    throw error;
  }
  if (!canManageAllEvaluations(guard) && !isOwnEvaluation(appointment, { id: guard.userId, name: guard.userName })) {
    return NextResponse.json({ error: "Você só pode confirmar avaliações atribuídas a você." }, { status: 403 });
  }
  const unitConfig = getEvaluationScheduleUnitConfigByUnit(appointment.unit);
  if (!unitConfig || !/avalia/i.test(appointment.procedimento || "")
    || !["pendente", "nao_confirmou"].includes(appointment.status) || appointment.startTime <= new Date()) {
    return unavailable("not_scheduled", "É necessário ter uma avaliação futura pendente de confirmação.");
  }
  const dealId = getPipelineDealIdFromEvaluationNotes(appointment.notes);
  let phone = validPhone(appointment.clientPhone);
  if (dealId) {
    const deal = await prisma.salesPipeline.findFirst({ where: { id: dealId, unit: unitConfig.unit, stage: "agendado" }, select: { id: true, clientId: true } });
    if (!deal) return unavailable("not_scheduled", "O negócio precisa estar no estágio Agendado nesta unidade.");
    if (!phone) {
      const client = await prisma.client.findFirst({ where: { id: deal.clientId, unit: unitConfig.unit }, select: { phone: true } });
      phone = validPhone(client?.phone);
    }
  }
  // Não transformar um @ do Instagram (mesmo contendo dígitos) em destinatário.
  if (!phone) {
    return unavailable("invalid_phone", "Cadastre um telefone válido com DDD no cadastro do cliente para confirmar pelo WhatsApp.");
  }
  const recipientPhone = phone;
  const instanceUrl = new URL(req.url);
  instanceUrl.search = new URLSearchParams({ unit: unitConfig.unit, targetInstanceId: unitConfig.instanceId }).toString();
  const { instances } = await getInstancesForRequest(new Request(instanceUrl, { headers: req.headers }));
  const instance = instances.find(item => item.id === unitConfig.instanceId && item.unit === unitConfig.unit && item.canReply === true);
  if (!instance) return NextResponse.json({ error: "Você não tem permissão para enviar pela caixa de leads desta unidade." }, { status: 403 });
  const conversation = await findConversationByPhone({ phone, instanceIds: [instance.id] });
  return {
    instance, unitConfig, appointment,
    conversation: conversation || { id: "", instanceId: instance.id, lastKnownJid: null, contact: { phone, name: appointment.clientName } },
    ...(!conversation ? { prepareConversation: async () => {
      const created = await createConversationForInstance({ instanceId: instance.id, phone: recipientPhone, contactName: appointment.clientName, unit: unitConfig.unit });
      return created;
    } } : {}),
  };
}

async function handle(req: NextRequest, context: RouteContext, send: boolean) {
  const auth = await requireAuth(req);
  if ("error" in auth) return auth.error;
  if (!hasPermission(auth.user, "crm") && !hasPermission(auth.user, "admin")) {
    return NextResponse.json({ error: "Sem permissão de acesso ao CRM." }, { status: 403 });
  }
  const headers = new Headers(req.headers);
  for (const [key, value] of Object.entries({
    "x-user-id": auth.user.userId, "x-user-name": auth.user.name, "x-user-role": auth.user.role,
    "x-user-unit": auth.user.unit || "", "x-user-permissions": JSON.stringify(auth.user.permissions || {}),
  })) headers.set(key, value);
  const verified = new NextRequest(req.url, { headers });
  const { id } = await context.params;
  const resolve = () => resolveAppointment(verified, id);
  return send ? sendEvaluationConfirmation(verified, resolve) : getEvaluationConfirmation(resolve);
}

export async function GET(req: NextRequest, context: RouteContext) { return handle(req, context, false); }
export async function POST(req: NextRequest, context: RouteContext) { return handle(req, context, true); }
