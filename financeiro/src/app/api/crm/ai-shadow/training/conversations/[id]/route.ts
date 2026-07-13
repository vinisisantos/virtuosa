import { NextRequest, NextResponse } from "next/server";
import { getUserFromHeaders } from "@/lib/auth";
import { canAccessAiTrainingUnit, canUseAiTraining } from "@/lib/ai-training";
import { prisma } from "@/lib/db";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : undefined;
}

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = getUserFromHeaders(req);
    if (!canUseAiTraining(user)) return NextResponse.json({ error: "Sem permissão para usar o treinamento da IA" }, { status: user ? 403 : 401 });
    const { id } = await context.params;
    const conversation = await prisma.aiTrainingConversation.findUnique({
      where: { id },
      select: {
        id: true,
        unit: true,
        title: true,
        createdByName: true,
        replyDueAt: true,
        replyStatus: true,
        replyVersion: true,
        createdAt: true,
        updatedAt: true,
        messages: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            role: true,
            content: true,
            originalContent: true,
            model: true,
            guardrailFlags: true,
            editedByName: true,
            editedAt: true,
            createdAt: true,
          },
        },
      },
    });
    if (!conversation) return NextResponse.json({ error: "Chat não encontrado" }, { status: 404 });
    if (!canAccessAiTrainingUnit(user!, conversation.unit)) {
      return NextResponse.json({ error: "Sem acesso a esta unidade" }, { status: 403 });
    }
    return NextResponse.json({ conversation });
  } catch (error: unknown) {
    console.error("[GET /api/crm/ai-shadow/training/conversations/:id]", error);
    return NextResponse.json({ error: "Falha ao carregar chat interno", details: errorMessage(error) }, { status: 500 });
  }
}
