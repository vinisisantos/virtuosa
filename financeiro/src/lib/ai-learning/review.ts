import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  AI_LEARNING_UNIT,
  AiLearningError,
  isSafeAiLearningCandidate,
  validateAiLearningCandidate,
} from "@/lib/ai-learning/policy";
import { validateAiLearningReviewInput } from "@/lib/ai-learning/review-policy";

export async function requireAiLearningAdmin(req: NextRequest) {
  const auth = await requireRole(req, ["ADMINISTRADOR"]);
  if ("error" in auth) throw new AiLearningError("Acesso administrativo necessário", auth.error.status);
  const user = await prisma.user.findUnique({
    where: { id: auth.user.userId },
    select: { id: true, name: true, role: true, isActive: true },
  });
  if (!user?.isActive || user.role !== "ADMINISTRADOR") {
    throw new AiLearningError("Acesso administrativo revogado", 403);
  }
  return user;
}

export function aiLearningErrorResponse(error: unknown) {
  if (error instanceof AiLearningError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  console.error("[AI Learning] Falha na revisão administrativa");
  return NextResponse.json({ error: "Não foi possível concluir a revisão" }, { status: 500 });
}

export async function reviewAiLearningCandidate(req: NextRequest, input: {
  id?: unknown;
  version?: unknown;
  action?: unknown;
  content?: unknown;
  confirmed?: unknown;
  clinicalConfirmed?: unknown;
}) {
  const reviewer = await requireAiLearningAdmin(req);
  if (typeof input.id !== "string" || !Number.isSafeInteger(input.version)) {
    throw new AiLearningError("Candidato inválido");
  }
  const current = await prisma.aiLearningCandidate.findFirst({
    where: { id: input.id, unit: AI_LEARNING_UNIT },
    select: { id: true, content: true, status: true, version: true },
  });
  if (!current || current.version !== input.version) {
    throw new AiLearningError("Candidato alterado; atualize a página", 409);
  }
  if (current.status !== "pending") {
    throw new AiLearningError("Somente candidatos pendentes podem ser revisados", 409);
  }
  const content = validateAiLearningCandidate(input.action === "edit" ? input.content : current.content);
  if (!isSafeAiLearningCandidate(content)) {
    throw new AiLearningError("O texto contém data, horário, preço ou dado identificável");
  }
  const action = validateAiLearningReviewInput(input, content.clinical);
  const status = action === "approve" ? "approved" : action === "reject" ? "rejected" : "pending";
  const count = await prisma.$executeRaw(Prisma.sql`
    UPDATE "AiLearningCandidate"
    SET content = ${JSON.stringify(content)}::jsonb,
      status = ${status},
      version = version + 1,
      "reviewedBy" = ${action === "edit" ? null : reviewer.id},
      "reviewedAt" = ${action === "edit" ? null : new Date()},
      history = history || jsonb_build_array(jsonb_build_object(
        'version', version,
        'content', content,
        'status', status,
        'actorId', ${reviewer.id},
        'actorName', ${reviewer.name},
        'action', ${action},
        'at', NOW()
      )),
      "updatedAt" = NOW()
    WHERE id = ${current.id} AND unit = ${AI_LEARNING_UNIT} AND version = ${current.version} AND status = 'pending'`);
  if (!count) throw new AiLearningError("Candidato alterado por outra pessoa", 409);
  return { success: true, status, version: current.version + 1 };
}
