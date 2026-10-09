import { Prisma } from "@prisma/client";
import { phoneLookupKey } from "@/lib/phone";
import { normalizedPhoneKeySql } from "@/lib/whatsapp/phone-sql";
import { EVALUATION_CONFIRMATION_REQUEST_AUTOMATION_TRIGGER } from "@/lib/whatsapp/evaluation-schedule-confirmation-message";
import type { EvaluationGroupConfig } from "@/lib/whatsapp/evaluation-group-notice-config";

export function evaluationGroupConfirmationSourcePredicate(params: {
  appointmentId: string;
  startTime: Date;
  appointmentCreatedAt: Date;
  clientPhone: string | null;
  config: EvaluationGroupConfig;
}) {
  const { config } = params;
  const startTime = params.startTime.toISOString();
  const phoneKey = params.clientPhone && /^[+\d ().-]+$/.test(params.clientPhone)
    && /^(55)?[1-9]\d{9,10}$/.test(params.clientPhone.replace(/\D/g, ""))
    ? phoneLookupKey(params.clientPhone) : null;
  const brazilianPhonePattern = "^(55)?[1-9][0-9]{9,10}$";

  // O aviso inicial continua sendo a prova do piloto. Sem ele, somente uma
  // solicitação de confirmação da mesma ocorrência, registrada por ID, comprova a caixa.
  // O acesso à PK evita procurar telefones ou varrer o JSON de todo o histórico.
  return Prisma.sql`CASE WHEN EXISTS (
    SELECT 1 FROM "WhatsAppEvaluationGroupNotice" original
    WHERE original."appointmentId" = ${params.appointmentId} AND original."eventKey" = 'scheduled'
  ) THEN EXISTS (
    SELECT 1 FROM "WhatsAppEvaluationGroupNotice" original
    WHERE original."appointmentId" = ${params.appointmentId} AND original."eventKey" = 'scheduled'
      AND original."instanceId" = ${config.instanceId} AND original."groupJid" = ${config.groupJid}
      AND original."configActivatedAt" = ${new Date(config.activatedAt)}
      AND original."appointmentCreatedAt" = ${params.appointmentCreatedAt}
  ) ELSE (
    SELECT count(*) = 1 AND bool_and(COALESCE(
      source."triggerData"->>'topic' = 'AGENDA'
      AND source."triggerData"->>'action' = ${EVALUATION_CONFIRMATION_REQUEST_AUTOMATION_TRIGGER}
      AND source."triggerData"->>'appointmentId' = ${params.appointmentId}
      AND source."triggerData"->>'startTime' = ${startTime}
      AND source."triggerData"->>'unit' = 'SBC'
      AND source."triggerData"->>'instanceId' = ${config.instanceId}
      AND conversation."instanceId" = ${config.instanceId}
      AND contact.phone !~ '[^0-9+ ().-]'
      AND regexp_replace(contact.phone, '[^0-9]', '', 'g') ~ ${brazilianPhonePattern}
      AND ${normalizedPhoneKeySql(Prisma.sql`contact.phone`)} = ${phoneKey}
      AND ${normalizedPhoneKeySql(Prisma.sql`source."contactPhone"`)} = ${phoneKey}
      AND source."contactPhone" !~ '[^0-9+ ().-]'
      AND regexp_replace(source."contactPhone", '[^0-9]', '', 'g') ~ ${brazilianPhonePattern}
      AND length(${phoneKey}::text) BETWEEN 10 AND 11
    , false))
    FROM "Automation" automation
    JOIN "AutomationLog" source ON source.id = 'evaluation-message:'
      || ${EVALUATION_CONFIRMATION_REQUEST_AUTOMATION_TRIGGER} || ':' || automation.id || ':'
      || ${params.appointmentId} || ':' || ${startTime}
      AND source."automationId" = automation.id AND source.result = 'success'
    LEFT JOIN "WhatsAppConversation" conversation ON conversation.id = source."triggerData"->>'conversationId'
    LEFT JOIN "WhatsAppContact" contact ON contact.id = conversation."contactId"
    WHERE automation."triggerType" = ${EVALUATION_CONFIRMATION_REQUEST_AUTOMATION_TRIGGER}
      AND automation.unit = 'SBC'
  ) END`;
}
