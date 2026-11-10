import { Prisma, type AliceAutonomousTurn } from "@prisma/client";
import { prisma } from "@/lib/db";
import { buildAliceContext, type AliceContextMessage } from "@/lib/alice/build-context";
import { currentAliceAppointment } from "@/lib/alice/current-appointment";
import { getOrCreateMemory, type AliceMemoryScope } from "@/lib/alice/memory";
import { observeAliceHistory } from "@/lib/alice/runtime-memory";
import { aliceFearPolicy, aliceHealthHistoryRequiresHuman } from "@/lib/alice/fear-policy";
import { classifyAliceHandoff } from "@/lib/ai-assistant/safety";
import { buildAliceKnowledgeContext } from "@/lib/ai-assistant/alice-knowledge";
import { buildSbcEvaluationOptions } from "@/lib/ai-assistant/sbc-scheduling-policy";
import type { AliceGuardContext } from "@/lib/alice/guards";
import type { AliceAutonomousContext, LegacyAliceAutonomousContext } from "@/lib/ai-assistant/autonomy/context";
import { projectAliceAudioHistory, isAliceTextInput } from "@/lib/alice/audio/history";

export type AliceMemoryRuntime = { scope: AliceMemoryScope; guard: AliceGuardContext };
type HistoryRow = AliceContextMessage & { messageId: string; createdAt: Date };

export { currentAliceAppointment };

export async function loadAliceMemoryContext(context: LegacyAliceAutonomousContext, turn: AliceAutonomousTurn,
  database = prisma, now = new Date()): Promise<AliceAutonomousContext> {
  const scope: AliceMemoryScope = { conversationId: turn.conversationId, instanceId: turn.instanceId, unidade: "SBC" };
  // Orçamento antes de transferir corpos: nunca trazer mídia base64 nem truncar histórico silenciosamente.
  const [size] = await database.$queryRaw<{ count: number; bytes: number }[]>(Prisma.sql`
    SELECT count(*)::int AS count, COALESCE(sum(octet_length(p.body)+COALESCE(octet_length(a.text),0)),0)::int AS bytes
    FROM "WhatsAppMessage" p LEFT JOIN "AliceAudioTranscript" a ON a."messageId"=p.id
      AND a."conversationId"=p."conversationId" AND a."instanceId"=${scope.instanceId} AND a.status='ready'
    WHERE p."conversationId"=${scope.conversationId} AND p.status<>'deleted'
      AND (p.type='text' OR p.body NOT LIKE 'data:%;base64,%')`);
  if (!size || size.count > 1_000 || size.bytes > 65_000) throw new Error("alice_history_budget_exceeded");
  const rows = await database.$queryRaw<HistoryRow[]>(Prisma.sql`
    SELECT id,"conversationId","messageId",CASE WHEN type<>'text' AND body LIKE 'data:%;base64,%' THEN '' ELSE body END AS body,
      type,"fromMe",status,timestamp,"createdAt","respondedByName" FROM "WhatsAppMessage"
    WHERE "conversationId"=${scope.conversationId} AND status<>'deleted' ORDER BY timestamp,id LIMIT 1001`);
  const history = await projectAliceAudioHistory(rows, scope.conversationId, scope.instanceId, database);
  if (history.length > 1_000) throw new Error("alice_history_budget_exceeded");
  if (history.findLast((message) => !message.fromMe)?.id !== turn.sourceMessageId) throw new Error("alice_history_source_changed");
  const campaign = typeof context.prompt.CAMPANHA === "string" ? context.prompt.CAMPANHA : "Não identificada";
  await getOrCreateMemory(scope, { nome: context.contactName, campanhaOrigem: campaign }, database);
  const memory = await observeAliceHistory(scope, history, turn.sourceMessageId, database);
  const appointment = await currentAliceAppointment(scope, context.conversation.contact.phone, database);
  const accepted = history.filter((message) => !message.fromMe || ["sent","delivered","read","played"].includes(message.status));
  const lastTeam = accepted.findLastIndex((message) => message.fromMe);
  const pending = accepted.slice(lastTeam + 1).filter((message) => !message.fromMe);
  const current = pending.length ? pending : [context.source];
  const knowledge = buildAliceKnowledgeContext({ unit: "SBC", campaignName: campaign,
    messageText: [...current, ...history.filter((message) => !message.fromMe).slice(0, 2)].map((message) => message.body).join(" ") });
  const prompt = buildAliceContext({ scope, memory, history, knowledge: knowledge || {}, campaignName: campaign,
    contactName: context.contactName, evaluationOptions: buildSbcEvaluationOptions(now), appointment, autonomous: true, now });
  const detectedFear = aliceFearPolicy(prompt);
  const fear = detectedFear && aliceHealthHistoryRequiresHuman(memory.saudeObservacoes)
    ? { ...detectedFear, requiresHuman: true, generalInformationOnly: false } : detectedFear;
  const clinical = classifyAliceHandoff({ unit: "SBC", campaignName: campaign, incomingMessages: current.map((message) => message.body) });
  // Retira somente os termos do medo geral e repete a triagem: uma doença junto da dúvida nunca é liberada.
  const remainingClinical = fear?.generalInformationOnly ? classifyAliceHandoff({ unit: "SBC", campaignName: campaign,
    incomingMessages: current.map((message) => message.body.normalize("NFKD").replace(/\p{Diacritic}/gu, "").toLowerCase()
      .replace(/\b(?:dor|doi|riscos?|reac\w*|rejeic\w*|contraindic\w*)\b/gu, "")) }) : clinical;
  const handoffReason = memory.escalarHumano || fear?.requiresHuman ? "clinical_safety" as const
    : clinical === "clinical_safety" && fear?.generalInformationOnly && !remainingClinical ? null : clinical;
  return { ...context, messages: history.filter((message) => isAliceTextInput(message) && message.body.trim()), prompt,
    handoffReason: handoffReason || (!isAliceTextInput(context.source) || !knowledge ? "model_requested" : null),
    memoryRuntime: { scope, guard: { scope, presentationAt: memory.apresentacaoFeitaEm, appointment, contactName: context.contactName, fear } } };
}
