import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requirePilotAccess } from "./access";
import { embed } from "./provider";
import {
  failOperation,
  finishOperation,
  reserveOperation,
  zeroUsage,
} from "./budget";
import {
  CONFIG_KEY,
  digest,
  EMBEDDING_MODEL,
  InboxAiError,
  knowledgeText,
  MAX_KNOWLEDGE,
  validateKnowledge,
  vectorLiteral,
  type KnowledgeContent,
} from "./policy";

export type Knowledge = {
  id: string;
  content: KnowledgeContent;
  status: string;
  version: number;
  sourceConversationId: string | null;
  sourceMessageIds: string[];
  relatedIds: string[];
  reviewedBy: string | null;
  clinicalReviewedBy: string | null;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};
export type KnowledgeVersion = { id: string; version: number };

export async function findKnowledge(
  vector: number[],
  incoming: string,
  approvedOnly = true,
) {
  const rows = await prisma.$queryRaw<
    (Knowledge & { distance: number })[]
  >(Prisma.sql`
    SELECT id, content, status, version, "expiresAt", "reviewedBy", "clinicalReviewedBy",
      embedding OPERATOR(extensions.<=>) ${vectorLiteral(vector)}::extensions.vector AS distance
    FROM "AiInboxKnowledge" WHERE unit = 'SCS' AND "embeddingModel" = ${EMBEDDING_MODEL} AND embedding IS NOT NULL
      AND ${
        approvedOnly
          ? Prisma.sql`status = 'approved' AND "reviewedBy" IS NOT NULL
        AND ("expiresAt" IS NULL OR "expiresAt" > NOW())
        AND (NOT (content->>'clinical')::boolean OR ("clinicalReviewedBy" IS NOT NULL AND length(content->>'procedure') > 0
          AND strpos(lower(${incoming}), lower(content->>'procedure')) > 0))`
          : Prisma.sql`status IN ('pending','approved')`
      }
    ORDER BY distance LIMIT 5`);
  return rows.filter((k) => Number.isFinite(k.distance) && k.distance < 0.55);
}

export async function validVersions(versions: KnowledgeVersion[]) {
  if (!versions.length) return true;
  const rows = await prisma.$queryRaw<
    { id: string; version: number }[]
  >(Prisma.sql`SELECT id, version FROM "AiInboxKnowledge"
    WHERE id IN (${Prisma.join(versions.map((v) => v.id))}) AND unit = 'SCS' AND status = 'approved' AND "reviewedBy" IS NOT NULL
    AND ("expiresAt" IS NULL OR "expiresAt" > NOW()) AND (NOT (content->>'clinical')::boolean OR "clinicalReviewedBy" IS NOT NULL)`);
  return versions.every((v) =>
    rows.some((k) => k.id === v.id && k.version === v.version),
  );
}

export async function insertCandidates(
  candidates: {
    content: KnowledgeContent;
    conversationId: string;
    sourceIds: string[];
    fingerprint: string;
  }[],
  vectors: number[][],
) {
  // One short unit lock also used by review prevents exceeding the active cap.
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${CONFIG_KEY}:knowledge`}))`;
      const [count] = await tx.$queryRaw<
        { count: number }[]
      >`SELECT count(*)::int AS count FROM "AiInboxKnowledge" WHERE status IN ('pending','approved')`;
      if (count.count + candidates.length > MAX_KNOWLEDGE)
        throw new InboxAiError(
          "Base atingiu 500 fichas. Revise as pendências antes de continuar.",
          429,
        );
      for (const [index, c] of candidates.entries()) {
        await tx.$executeRaw`INSERT INTO "AiInboxKnowledge" (id, content, "sourceConversationId", "sourceMessageIds", "sourceFingerprint", embedding, "embeddingModel", "relatedIds")
        VALUES (${randomUUID()}, ${JSON.stringify(c.content)}::jsonb, ${c.conversationId}, ${JSON.stringify(c.sourceIds)}::jsonb, ${c.fingerprint},
          ${vectorLiteral(vectors[index])}::extensions.vector, ${EMBEDDING_MODEL},
          COALESCE((SELECT jsonb_agg(id) FROM (SELECT id FROM "AiInboxKnowledge" WHERE status IN ('pending','approved') AND "embeddingModel" = ${EMBEDDING_MODEL}
            AND embedding OPERATOR(extensions.<=>) ${vectorLiteral(vectors[index])}::extensions.vector < 0.25 LIMIT 3) related), '[]'::jsonb))
        ON CONFLICT ("sourceFingerprint") DO NOTHING`;
      }
    },
    { timeout: 10000 },
  );
}

export async function reviewKnowledge(
  req: Request,
  input: {
    id: string;
    version: number;
    action: string;
    content?: unknown;
    expiresAt?: string;
    confirmed?: boolean;
  },
) {
  const access = await requirePilotAccess(req);
  if (!access.canReview)
    throw new InboxAiError(
      "Somente revisores autorizados podem alterar aprendizados",
      403,
    );
  const [current] = await prisma.$queryRaw<
    Knowledge[]
  >`SELECT id, content, status, version, "sourceConversationId", "sourceMessageIds", "relatedIds", "expiresAt"
    FROM "AiInboxKnowledge" WHERE id = ${input.id} AND unit = 'SCS'`;
  if (!current || current.version !== input.version)
    throw new InboxAiError(
      "Ficha alterada. Atualize a lista antes de continuar.",
      409,
    );
  if (current.sourceConversationId) {
    const source = await prisma.whatsAppConversation.findFirst({
      where: {
        id: current.sourceConversationId,
        instanceId: { in: access.instanceIds },
      },
      select: { id: true },
    });
    if (!source)
      throw new InboxAiError(
        "Sem acesso à caixa de origem para revisar esta ficha",
        403,
      );
  } else throw new InboxAiError("Origem indisponível para revisão", 409);
  const action = input.action;
  if (!["edit", "approve", "reject", "disable"].includes(action))
    throw new InboxAiError("Ação inválida");
  const content = validateKnowledge(
    action === "edit" ? input.content : current.content,
  );
  if (
    current.content.clinical &&
    !content.clinical &&
    !access.canReviewClinical
  )
    throw new InboxAiError(
      "Somente revisão técnica pode reclassificar conteúdo clínico",
      403,
    );
  if (action === "approve" && content.clinical && !access.canReviewClinical)
    throw new InboxAiError(
      "Esta ficha exige aprovação da responsável técnica",
      403,
    );
  if (action === "approve" && input.confirmed !== true)
    throw new InboxAiError(
      "Confirme conteúdo, privacidade, condições e ausência de conflitos",
    );
  const expiry = input.expiresAt ? new Date(input.expiresAt) : null;
  if (
    action === "approve" &&
    (!expiry ||
      !Number.isFinite(expiry.getTime()) ||
      expiry <= new Date() ||
      expiry.getTime() > Date.now() + 90 * 86400000)
  )
    throw new InboxAiError(
      "Informe validade futura de até 90 dias para revisar informações desatualizadas",
    );
  const usage = zeroUsage();
  let vector: number[] | null = null;
  let operationId: string | null = null;
  if (action === "approve") {
    const operation = await reserveOperation({
      key: digest(["index", current.id, current.version]),
      kind: "index",
      amount: 500,
      snapshot: digest(content),
      userId: access.userId,
    });
    operationId = operation.operation.id;
    if (operation.reused)
      throw new InboxAiError(
        "Esta aprovação já foi processada ou precisa de uma edição antes de nova tentativa.",
        409,
      );
    try {
      [vector] = await embed([knowledgeText(content)], usage);
    } catch (error) {
      await failOperation(operationId);
      throw error;
    }
  }
  try {
    // Re-read access after network work, not just before charging/indexing.
    const freshAccess = await requirePilotAccess(req);
    if (
      !freshAccess.canReview ||
      (action === "approve" &&
        content.clinical &&
        !freshAccess.canReviewClinical)
    )
      throw new InboxAiError("Permissão de revisão alterada", 403);
    const freshSource = await prisma.whatsAppConversation.findFirst({
      where: {
        id: current.sourceConversationId,
        instanceId: { in: freshAccess.instanceIds },
      },
      select: { id: true },
    });
    if (!freshSource) throw new InboxAiError("Acesso à origem alterado", 403);
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${CONFIG_KEY}:knowledge`}))`;
      const status =
        action === "approve"
          ? "approved"
          : action === "reject"
            ? "rejected"
            : action === "disable"
              ? "disabled"
              : "pending";
      if (status === "pending" || status === "approved") {
        const [count] = await tx.$queryRaw<
          { count: number }[]
        >`SELECT count(*)::int AS count FROM "AiInboxKnowledge" WHERE status IN ('pending','approved') AND id <> ${current.id}`;
        if (count.count >= MAX_KNOWLEDGE)
          throw new InboxAiError("Limite de 500 fichas ativas atingido", 429);
      }
      const rows =
        await tx.$executeRaw`UPDATE "AiInboxKnowledge" SET content = ${JSON.stringify(content)}::jsonb, status = ${status}, version = version + 1,
        embedding = ${vector ? vectorLiteral(vector) : null}::extensions.vector, "embeddingModel" = ${vector ? EMBEDDING_MODEL : null},
        "reviewedBy" = ${action === "approve" ? access.userId : null}, "reviewedAt" = ${action === "approve" ? new Date() : null},
        "clinicalReviewedBy" = ${action === "approve" && content.clinical ? access.userId : null}, "expiresAt" = ${action === "approve" ? expiry : null},
        history = history || jsonb_build_array(jsonb_build_object('version', version, 'content', content, 'status', status, 'actor', ${access.userId}::text, 'at', NOW(), 'action', ${action}::text)),
        "updatedAt" = NOW() WHERE id = ${current.id} AND version = ${input.version}`;
      if (!rows)
        throw new InboxAiError(
          "Ficha alterada por outra pessoa; atualize a lista.",
          409,
        );
    });
    if (operationId)
      await finishOperation(operationId, { knowledgeId: current.id }, usage);
    return { success: true };
  } catch (error) {
    if (operationId) await failOperation(operationId);
    throw error;
  }
}
