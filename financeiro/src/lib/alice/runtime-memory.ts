import { Prisma, type LeadMemory } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ALICE_AUTONOMY_INSTANCE_ID } from "@/lib/ai-assistant/autonomy/policy";
import { containsPersonalPresentation } from "@/lib/alice/presentation-filter";
import { getOrCreateMemory, applyMemoryUpdate, type AliceMemoryScope, type AliceMemoryUpdate } from "@/lib/alice/memory";
import type { AliceContextMessage } from "@/lib/alice/build-context";
import { AliceMemoryError } from "@/lib/alice/memory-input";
import { observedAliceQuestions } from "@/lib/alice/observed-questions";

type Database = Pick<typeof prisma, "$queryRaw">;
export const aliceMemoryEnabled = () => process.env.ALICE_CONVERSATION_MEMORY_SBC_ENABLED === "true";
const checkScope = (scope: AliceMemoryScope) => {
  if (!scope?.conversationId?.trim() || scope.instanceId !== ALICE_AUTONOMY_INSTANCE_ID || scope.unidade !== "SBC") throw new AliceMemoryError("invalid_scope");
};

/** Reconcilia apenas fatos de mensagens aceitas da conversa exata, nunca flags do modelo. */
export async function observeAliceHistory(scope: AliceMemoryScope, history: readonly AliceContextMessage[],
  sourceId: string, database: Database = prisma): Promise<LeadMemory> {
  checkScope(scope);
  const evidence = history.filter((message) => message.fromMe && message.type === "text"
    && ["sent", "delivered", "read", "played"].includes(message.status)).map((message) => ({
    id: message.id, body: message.body, presentation: containsPersonalPresentation(message.body), questions: observedAliceQuestions(message.body),
  }));
  const rows = await database.$queryRaw<LeadMemory[]>(Prisma.sql`
    WITH verified AS (
      SELECT p.*, e.presentation, e.questions FROM jsonb_to_recordset(${JSON.stringify(evidence)}::jsonb)
        AS e(id TEXT, body TEXT, presentation BOOLEAN, questions JSONB)
      JOIN "WhatsAppMessage" p ON p.id=e.id AND p.body=e.body
      WHERE p."conversationId"=${scope.conversationId} AND p."fromMe"=TRUE
        AND p.type='text' AND p.status IN ('sent','delivered','read','played')
    )
    UPDATE "LeadMemory" m SET
      "apresentacaoFeitaEm"=COALESCE(m."apresentacaoFeitaEm", (SELECT min(timestamp) FROM verified WHERE presentation)),
      "ultimaMensagemClienteEm"=GREATEST(m."ultimaMensagemClienteEm", source.timestamp),
      "ultimaMensagemAliceEm"=GREATEST(m."ultimaMensagemAliceEm", (SELECT max(timestamp) FROM verified
        WHERE "respondedBy" IS NULL AND "respondedByName" IN ('Alice','Alice (automação)'))),
      "perguntasFeitas"=ARRAY(SELECT DISTINCT value FROM (
        SELECT unnest(m."perguntasFeitas") AS value UNION ALL
        SELECT jsonb_array_elements_text(questions) FROM verified) all_questions ORDER BY value),
      "updatedAt"=clock_timestamp()
    FROM "WhatsAppConversation" c JOIN "WhatsAppInstance" i ON i.id=c."instanceId"
      JOIN "WhatsAppMessage" source ON source."conversationId"=c.id
    WHERE c.id=${scope.conversationId} AND c."instanceId"=${ALICE_AUTONOMY_INSTANCE_ID} AND i.unit='SBC'
      AND m."conversationId"=c.id AND m.unidade='SBC' AND source.id=${sourceId}
      AND source."fromMe"=FALSE AND source.status<>'deleted' RETURNING m.*`);
  if (!rows[0]) throw new Error("alice_memory_source_unavailable");
  return rows[0];
}

/** Serializa somente a escrita final; nenhuma chamada de rede ocorre sob esse lock. */
export async function applyCurrentAliceMemory(scope: AliceMemoryScope, sourceId: string, patch: AliceMemoryUpdate,
  database = prisma): Promise<boolean> {
  checkScope(scope);
  return database.$transaction(async (tx) => {
    const source = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT c.id FROM "WhatsAppConversation" c JOIN "WhatsAppInstance" i ON i.id=c."instanceId"
      WHERE c.id=${scope.conversationId} AND c."instanceId"=${scope.instanceId} AND i.unit='SBC' AND c."aiMode"='agent'
        AND (SELECT p.id FROM "WhatsAppMessage" p WHERE p."conversationId"=c.id AND p."fromMe"=FALSE
          AND p.status<>'deleted' ORDER BY p.timestamp DESC,p.id DESC LIMIT 1)=${sourceId} FOR UPDATE OF c`);
    if (!source.length) return false;
    const facts = { ...patch };
    delete facts.perguntasFeitas;
    await applyMemoryUpdate(scope, facts, tx);
    return true;
  });
}

/** Chamado somente depois da autorização da rota e de uma retomada explícita pela equipe. */
export async function clearAliceEscalationOnResume(scope: AliceMemoryScope, database: Database = prisma): Promise<void> {
  checkScope(scope);
  if (!aliceMemoryEnabled()) return;
  await database.$queryRaw(Prisma.sql`UPDATE "LeadMemory" m SET "escalarHumano"=FALSE, "motivoEscalonamento"=NULL,
    "updatedAt"=clock_timestamp() FROM "WhatsAppConversation" c JOIN "WhatsAppInstance" i ON i.id=c."instanceId"
    WHERE m."conversationId"=c.id AND m.unidade='SBC' AND c.id=${scope.conversationId}
      AND c."instanceId"=${scope.instanceId} AND i.unit='SBC' RETURNING m.id`);
}

export async function rememberHumanPresentation(params: { conversationId: string; instanceId: string; messageRowId: string;
  body: string; type: string; status: string }, database = prisma): Promise<void> {
  if (!aliceMemoryEnabled() || params.instanceId !== ALICE_AUTONOMY_INSTANCE_ID || params.type !== "text"
    || !["sent", "delivered", "read", "played"].includes(params.status) || !containsPersonalPresentation(params.body)) return;
  const scope: AliceMemoryScope = { conversationId: params.conversationId, instanceId: params.instanceId, unidade: "SBC" };
  await getOrCreateMemory(scope, {}, database);
  const { markPresentationDone } = await import("@/lib/alice/memory");
  await markPresentationDone(scope, params.messageRowId, database);
}
