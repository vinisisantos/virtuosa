import { prisma } from "@/lib/db";
import { phoneLookupKey } from "@/lib/phone";
import { sendAutomationText } from "@/lib/whatsapp/automation-sender";
import { ensureEvaluationNoResponseAutomation } from "@/lib/whatsapp/evaluation-no-response-automation";
import { EVALUATION_NO_RESPONSE_TRIGGER, noResponseConfig, noResponseExecutionId, noResponseSendingHours } from "@/lib/whatsapp/evaluation-no-response-policy";
import { noResponseCandidatesQuery, type NoResponseCandidate, type NoResponseScope } from "@/lib/whatsapp/evaluation-no-response-query";
import { buildEvaluationConfirmationRequestMessage, getEvaluationScheduleAutomationMessage, getEvaluationScheduleUnitConfigByUnit } from "@/lib/whatsapp/evaluation-schedule-confirmation-message";

class NoResponseCancelled extends Error {}

export async function sendEvaluationNoResponseReminder(context: {
  conversationId: string; instanceId: string; unit: string; actorId: string; actorName: string;
}, options: {
  deadlineAt?: number;
  database?: typeof prisma;
  sendText?: typeof sendAutomationText;
  clock?: () => number;
} = {}) {
  const database = options.database || prisma;
  const sendText = options.sendText || sendAutomationText;
  const clock = options.clock || Date.now;
  const now = new Date(clock());
  const hasTime = () => !options.deadlineAt || clock() + 20000 < options.deadlineAt;
  const result = { checked: 0, sent: 0, skipped: 0, uncertain: 0 };
  const unit = getEvaluationScheduleUnitConfigByUnit(context.unit);
  if (!context.conversationId || !context.actorId || !unit || unit.instanceId !== context.instanceId) {
    throw new Error("Contexto de envio inválido.");
  }
  if (!noResponseSendingHours(now)) return { ...result, reason: "outside_hours" as const };
  if (!hasTime()) return { ...result, reason: "timeout" as const };

  const automation = await ensureEvaluationNoResponseAutomation(unit.unit, context.actorName, database);
  const config = noResponseConfig(automation.triggerConfig);
  if (!automation.isActive || !getEvaluationScheduleAutomationMessage(automation.steps)) {
    return { ...result, reason: "disabled" as const };
  }
  const scope: NoResponseScope = { id: automation.id, unit: unit.unit, instanceId: unit.instanceId,
    delayHours: config.delayHours, updatedAt: automation.updatedAt };
  const [candidate] = await database.$queryRaw<NoResponseCandidate[]>(noResponseCandidatesQuery([scope], now, context.conversationId));
  if (!candidate || !hasTime()) return result;
  result.checked = 1;
  if (!phoneLookupKey(candidate.clientPhone) || phoneLookupKey(candidate.clientPhone) !== phoneLookupKey(candidate.contactPhone)) {
    result.skipped = 1;
    return result;
  }
  const claimId = noResponseExecutionId(candidate.appointmentId, candidate.startTime);
  const triggerData = {
    topic: "AGENDA", action: EVALUATION_NO_RESPONSE_TRIGGER, source: "manual",
    actorId: context.actorId, actorName: context.actorName,
    sourceLogId: candidate.sourceLogId, appointmentId: candidate.appointmentId,
    startTime: candidate.startTime.toISOString(), conversationId: candidate.conversationId,
    instanceId: candidate.instanceId, unit: candidate.unit, confirmationSentAt: candidate.sentAt.toISOString(),
  };
  try {
    await database.automationLog.create({ data: {
      id: claimId, automationId: automation.id, triggerData, result: "processing",
      contactPhone: candidate.contactPhone, contactName: candidate.clientName,
    } });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
      result.skipped = 1;
      return result;
    }
    throw error;
  }

  try {
    const sent = await sendText({
      dbInstance: { name: candidate.instanceName, provider: candidate.provider },
      conversationId: candidate.conversationId, contactPhone: candidate.contactPhone,
      lastKnownJid: candidate.lastKnownJid, respondedByName: context.actorName,
      message: buildEvaluationConfirmationRequestMessage({
        unit: unit.unit, clientName: candidate.clientName, startTime: candidate.startTime,
        template: getEvaluationScheduleAutomationMessage(automation.steps)!,
      }),
      beforeSend: async () => {
        const currentTime = new Date(clock());
        if (!hasTime() || !noResponseSendingHours(currentTime)) throw new NoResponseCancelled("Fora da janela de envio.");
        const [fresh] = await database.$queryRaw<NoResponseCandidate[]>(noResponseCandidatesQuery([scope], currentTime, context.conversationId, {
          sourceLogId: candidate.sourceLogId, claimId,
        }));
        if (!fresh || fresh.conversationId !== candidate.conversationId
          || fresh.contactPhone !== candidate.contactPhone || fresh.lastKnownJid !== candidate.lastKnownJid
          || fresh.clientName !== candidate.clientName || fresh.instanceName !== candidate.instanceName
          || fresh.provider !== candidate.provider) {
          throw new NoResponseCancelled("Resposta recebida ou agendamento/configuração alterados antes do envio.");
        }
      },
    });
    // Falha após o aceite externo nunca libera a reserva para um reenvio automático.
    await database.automationLog.update({ where: { id: claimId }, data: {
      result: "success", error: null, triggerData: { ...triggerData, messageId: sent.messageId },
    } });
    result.sent = 1;
    await database.automation.update({ where: { id: automation.id }, data: {
      executionCount: { increment: 1 }, lastExecutedAt: new Date(clock()),
    } }).catch(() => console.error("[Evaluation no response] Contador não atualizado após envio."));
  } catch (error) {
    const cancelled = error instanceof NoResponseCancelled;
    result[cancelled ? "skipped" : "uncertain"] = 1;
    await database.automationLog.update({ where: { id: claimId }, data: {
      result: cancelled ? "skipped" : "uncertain",
      error: cancelled ? error.message : "Não foi possível confirmar o resultado do envio. Sem repetição automática; confira o histórico da conversa.",
    } }).catch(() => console.error("[Evaluation no response] Reserva preservada sem atualizar auditoria."));
  }
  return result;
}
