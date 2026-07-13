import { NextRequest, NextResponse } from "next/server";
import { getUserFromHeaders } from "@/lib/auth";
import { canAccessAiTrainingUnit, canUseAiTraining, visibleAiTrainingUnits } from "@/lib/ai-training";
import { prisma } from "@/lib/db";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : undefined;
}

export async function GET(req: NextRequest) {
  try {
    const user = getUserFromHeaders(req);
    if (!canUseAiTraining(user)) return NextResponse.json({ error: "Sem permissão para usar o treinamento da IA" }, { status: user ? 403 : 401 });
    const allowedUnits = visibleAiTrainingUnits(user!);
    const requestedUnit = new URL(req.url).searchParams.get("unit");
    if (requestedUnit && !canAccessAiTrainingUnit(user!, requestedUnit)) {
      return NextResponse.json({ error: "Sem acesso a esta unidade" }, { status: 403 });
    }

    const conversations = await prisma.aiTrainingConversation.findMany({
      where: {
        archived: false,
        unit: requestedUnit ? requestedUnit : { in: allowedUnits },
      },
      select: {
        id: true,
        unit: true,
        title: true,
        createdById: true,
        createdByName: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { messages: true } },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { content: true, role: true, createdAt: true },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 50,
    });

    return NextResponse.json({ conversations, allowedUnits, isAdmin: user!.isAdmin });
  } catch (error: unknown) {
    console.error("[GET /api/crm/ai-shadow/training/conversations]", error);
    return NextResponse.json({ error: "Falha ao carregar chats internos", details: errorMessage(error) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = getUserFromHeaders(req);
    if (!canUseAiTraining(user)) return NextResponse.json({ error: "Sem permissão para usar o treinamento da IA" }, { status: user ? 403 : 401 });
    const body = await req.json().catch(() => ({}));
    const unit = typeof body.unit === "string" ? body.unit : "";
    if (!canAccessAiTrainingUnit(user!, unit)) {
      return NextResponse.json({ error: "Selecione uma unidade permitida" }, { status: 403 });
    }

    const conversation = await prisma.aiTrainingConversation.create({
      data: {
        unit,
        title: "Nova simulação",
        createdById: user!.userId,
        createdByName: user!.name || user!.email,
      },
    });
    return NextResponse.json({ conversation }, { status: 201 });
  } catch (error: unknown) {
    console.error("[POST /api/crm/ai-shadow/training/conversations]", error);
    return NextResponse.json({ error: "Falha ao criar chat interno", details: errorMessage(error) }, { status: 500 });
  }
}
