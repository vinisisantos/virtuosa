import { NextRequest, NextResponse } from "next/server";
import { getUserFromHeaders } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isGeneratedDraftValid } from "@/lib/ai-shadow";

function canReview(req: NextRequest) {
  const user = getUserFromHeaders(req);
  if (!user) return { allowed: false, response: NextResponse.json({ error: "Não autorizado" }, { status: 401 }) };
  if (user.isAdmin || user.permissions?.crmSilentAnalysis === true) return { allowed: true, user };
  return { allowed: false, response: NextResponse.json({ error: "Sem permissão para avaliar IA" }, { status: 403 }) };
}

export async function POST(req: NextRequest) {
  try {
    const auth = canReview(req);
    if (!auth.allowed) return auth.response;
    const user = auth.user!;
    const body = await req.json().catch(() => ({}));
    const runId = typeof body.runId === "string" ? body.runId : "";
    const selectedOption = typeof body.selectedOption === "string" ? body.selectedOption : "";

    if (!runId) return NextResponse.json({ error: "runId obrigatório" }, { status: 400 });
    if (!["A", "B", "any", "none", "approved", "rejected"].includes(selectedOption)) {
      return NextResponse.json({ error: "Escolha inválida" }, { status: 400 });
    }

    const run = await prisma.aiShadowRun.findUnique({
      where: { id: runId },
      select: {
        id: true,
        unit: true,
        status: true,
        drafts: {
          select: { modelKey: true, status: true, messages: true, handoffReason: true, decision: true },
        },
      },
    });
    if (!run) return NextResponse.json({ error: "Rodada não encontrada" }, { status: 404 });
    if (!["ready", "failed"].includes(run.status)) {
      return NextResponse.json({ error: "Esta rodada não está pronta para avaliação." }, { status: 409 });
    }
    const primaryDraft = run.drafts.find((draft) => draft.modelKey === "modelB");
    if (!primaryDraft || !isGeneratedDraftValid(primaryDraft)) {
      return NextResponse.json({ error: "Resposta do GPT-5.4 incompleta. Reprocesse antes de avaliar." }, { status: 409 });
    }

    const humanScore = Number.isFinite(Number(body.humanScore))
      ? Math.max(1, Math.min(5, Number(body.humanScore)))
      : null;
    const review = await prisma.$transaction(async (tx) => {
      const created = await tx.aiShadowReview.create({
        data: {
          runId,
          reviewerId: user.userId,
          reviewerName: user.name || user.email || null,
          selectedOption,
          humanScore,
          severeErrorA: body.severeErrorA === true,
          severeErrorB: body.severeErrorB === true,
          severeErrorNotes: typeof body.severeErrorNotes === "string" ? body.severeErrorNotes.trim().slice(0, 1000) : null,
          handoffAssessment: typeof body.handoffAssessment === "string" ? body.handoffAssessment : null,
          notes: typeof body.notes === "string" ? body.notes.trim().slice(0, 1000) : null,
        },
      });
      await tx.aiShadowRun.update({
        where: { id: runId },
        data: { status: "reviewed" },
      });
      return created;
    });

    return NextResponse.json({ review });
  } catch (error: any) {
    console.error("[POST /api/crm/ai-shadow/reviews]", error);
    return NextResponse.json({ error: "Falha ao salvar avaliação", details: error?.message }, { status: 500 });
  }
}
