import type { Prisma } from "@prisma/client";
import { currentAliceAppointment } from "@/lib/alice/current-appointment";
import { buildSbcEvaluationOptions, deriveSbcEvaluationChoice } from "@/lib/ai-assistant/sbc-scheduling-policy";
import { evaluationRequestedPeriod, evaluationSlotPeriod } from "@/lib/ai-assistant/evaluation-offer-policy";
import { SBC_BOOKING_CHOICE_CLARIFICATION } from "@/lib/ai-assistant/sbc-scheduling-exchange";
import { aliceAutonomySchedulingTextValid } from "@/lib/ai-assistant/autonomy/content-policy";
import { ALICE_AUTONOMY_INSTANCE_ID, ALICE_AUTONOMY_RECOVERY_WINDOW_MS } from "@/lib/ai-assistant/autonomy/policy";

type Message = { id: string; messageId: string; body: string; fromMe: boolean; type: string; status: string;
  respondedBy: string | null; respondedByName: string | null; timestamp: Date; createdAt: Date };
const acceptedAlice = (message: Message) => message.fromMe && message.type === "text" && !message.respondedBy
  && message.respondedByName === "Alice" && ["sent", "delivered", "read", "played"].includes(message.status);

function prepareContinuation(history: Message[], now: Date) {
  const [offer, source, previous] = history.slice(-3);
  if (!offer || !source || !previous || !acceptedAlice(offer) || !acceptedAlice(previous)
    || previous.body !== SBC_BOOKING_CHOICE_CLARIFICATION || source.fromMe || source.type !== "text") return null;
  const period = evaluationRequestedPeriod(source.body);
  const cutoff = +now - ALICE_AUTONOMY_RECOVERY_WINDOW_MS;
  if (!period || +source.timestamp < cutoff || +source.createdAt < cutoff || +source.timestamp > +now
    || +source.createdAt > +now || +offer.timestamp >= +source.timestamp || +source.timestamp >= +previous.timestamp
    || +previous.timestamp > +now || +now - +offer.timestamp >= 86_400_000) return null;
  const dates = [...offer.body.matchAll(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\b/gu)];
  const clock = offer.body.match(/\b\d{1,2}(?:h(?:\d{2})?|:\d{2})(?![\p{L}\p{N}])/iu)?.[0];
  if (dates.length !== 1 || !clock) return null;
  const selected = deriveSbcEvaluationChoice({ offer, reply: { ...source, body: clock }, now });
  const grid = buildSbcEvaluationOptions(now);
  if (!selected || !aliceAutonomySchedulingTextValid([offer.body], now, { UNIDADE: "SBC", HORARIOS_SBC: grid })) return null;
  const key = selected.slice(0, 10);
  const requestedDay = source.body.normalize("NFKD").replace(/\p{Diacritic}/gu, "").toLowerCase()
    .match(/\b(domingo|segunda|terca|quarta|quinta|sexta|sabado)\b/u)?.[1];
  if (requestedDay && ["domingo", "segunda", "terca", "quarta", "quinta", "sexta", "sabado"]
    [new Date(`${key}T12:00:00-03:00`).getUTCDay()] !== requestedDay) return null;
  const options = grid.filter(slot => slot.startsWith(`${key}T`) && evaluationSlotPeriod(slot.slice(11)) === period).slice(0, 3);
  if (!options.length) return null;
  const day = new Intl.DateTimeFormat("pt-BR", { weekday: "long", timeZone: "America/Sao_Paulo" })
    .format(new Date(`${key}T12:00:00-03:00`));
  const times = options.map(slot => `${Number(slot.slice(11, 13))}h${slot.endsWith(":00") ? "" : slot.slice(14)}`);
  const list = times.length > 1 ? `${times.slice(0, -1).join(", ")} ou ${times.at(-1)}` : times[0];
  const date = key.split("-").reverse().join("/");
  const response = `Sim! Para ${day}, ${date}, posso te oferecer ${list}. Qual fica melhor para você? 😊`;
  if (!aliceAutonomySchedulingTextValid([response], now, { UNIDADE: "SBC", HORARIOS_SBC: grid,
    CONVERSA: [{ role: "cliente", text: source.body }] })) return null;
  return { offer, source, previous, response, period };
}

/** Somente ativação individual autenticada: acrescenta uma saída, sem apagar o envio aceito nem reiniciar geração. */
export async function recoverAlicePeriodNegotiation(conversationId: string, operator: string,
  database: Prisma.TransactionClient, now: Date) {
  if (!operator) return false;
  const history = await database.whatsAppMessage.findMany({ where: { conversationId, status: { not: "deleted" } },
    select: { id: true, messageId: true, body: true, fromMe: true, type: true, status: true, respondedBy: true,
      respondedByName: true, timestamp: true, createdAt: true }, orderBy: [{ timestamp: "desc" }, { id: "desc" }], take: 3 });
  const prepared = prepareContinuation(history.reverse(), now);
  if (!prepared) return false;
  const { offer, source, previous, response, period } = prepared;
  const [turn, memory, conversation] = await Promise.all([
    database.aliceAutonomousTurn.findUnique({ where: { conversationId_sourceMessageId: { conversationId, sourceMessageId: source.id } } }),
    database.leadMemory.findFirst({ where: { conversationId, unidade: "SBC" }, select: { escalarHumano: true, saudeObservacoes: true } }),
    database.whatsAppConversation.findFirst({ where: { id: conversationId, instanceId: ALICE_AUTONOMY_INSTANCE_ID },
      select: { contact: { select: { phone: true } } } }),
  ]);
  if (!turn || turn.instanceId !== ALICE_AUTONOMY_INSTANCE_ID || turn.origin !== "inbound" || turn.status !== "sent"
    || turn.error || turn.attempts !== 1 || turn.nextMessageIndex !== 1 || turn.appointmentId || turn.claimToken
    || turn.messagesJson !== null || +turn.firstSentAt! !== +previous.timestamp
    || JSON.stringify(turn.providerMessageIds) !== JSON.stringify([previous.messageId])
    || memory?.escalarHumano || memory?.saudeObservacoes || !conversation?.contact.phone) return false;
  if (await currentAliceAppointment({ conversationId, instanceId: ALICE_AUTONOMY_INSTANCE_ID, unidade: "SBC" },
    conversation.contact.phone, database)) return false;
  // O lock da ativação serializa retomadas; a condição final protege também eventos que chegaram durante as leituras.
  const count = await database.$executeRaw`
    UPDATE "AliceAutonomousTurn" t SET status='queued',"availableAt"=${now},"completedAt"=NULL,
      "claimedAt"=NULL,"messagesJson"=${JSON.stringify([previous.body, response])}::jsonb,"updatedAt"=${now}
    WHERE t.id=${turn.id} AND t."conversationId"=${conversationId} AND t."instanceId"=${ALICE_AUTONOMY_INSTANCE_ID}
      AND t."sourceMessageId"=${source.id}
      AND t.status='sent' AND t.origin='inbound' AND t.attempts=1 AND t."nextMessageIndex"=1
      AND t."appointmentId" IS NULL AND t."claimToken" IS NULL AND t.error IS NULL
      AND t."firstSentAt"=${previous.timestamp} AND t."providerMessageIds"=${JSON.stringify([previous.messageId])}::jsonb
      AND (t."messagesJson" IS NULL OR t."messagesJson"='null'::jsonb)
      AND (SELECT id FROM "WhatsAppMessage" WHERE "conversationId"=${conversationId} AND status<>'deleted'
        ORDER BY timestamp DESC,id DESC LIMIT 1)=${previous.id}
      AND EXISTS (SELECT 1 FROM "WhatsAppMessage" WHERE id=${source.id} AND "conversationId"=${conversationId}
        AND body=${source.body} AND timestamp=${source.timestamp} AND "createdAt"=${source.createdAt}
        AND type='text' AND NOT "fromMe" AND status<>'deleted')
      AND EXISTS (SELECT 1 FROM "WhatsAppMessage" WHERE id=${offer.id} AND "conversationId"=${conversationId}
        AND body=${offer.body} AND timestamp=${offer.timestamp} AND "respondedBy" IS NULL AND "respondedByName"='Alice'
        AND type='text' AND "fromMe" AND status IN ('sent','delivered','read','played'))
      AND EXISTS (SELECT 1 FROM "WhatsAppMessage" WHERE id=${previous.id} AND "conversationId"=${conversationId}
        AND body=${previous.body} AND "messageId"=${previous.messageId} AND "fromMe" AND "respondedBy" IS NULL
        AND "respondedByName"='Alice' AND status IN ('sent','delivered','read','played'))
      AND NOT EXISTS (SELECT 1 FROM "AliceAutoSchedule" WHERE "conversationId"=${conversationId})
      AND NOT EXISTS (SELECT 1 FROM "AliceAutonomousTurn" WHERE "conversationId"=${conversationId} AND status IN ('queued','processing','sending'))
      AND NOT EXISTS (SELECT 1 FROM "LeadMemory" WHERE "conversationId"=${conversationId}
        AND ("escalarHumano" OR "saudeObservacoes" IS NOT NULL))`;
  if (!count) return false;
  await database.auditLog.create({ data: { userName: "Operador do CRM", unit: "SBC",
    action: "alice_period_negotiation_recovery", entity: "AliceAutonomousTurn", entityId: turn.id,
    details: JSON.stringify({ reason: "period_question_misclassified", operatorId: operator, period, continuationIndex: 1 }) } });
  return true;
}
