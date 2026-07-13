import { NextRequest, NextResponse } from "next/server";
import { getUserFromHeaders } from "@/lib/auth";
import { canUseAiTraining, visibleAiTrainingUnits } from "@/lib/ai-training";
import { prisma } from "@/lib/db";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : undefined;
}

export async function GET(req: NextRequest) {
  try {
    const user = getUserFromHeaders(req);
    if (!canUseAiTraining(user)) return NextResponse.json({ error: "Sem permissão para ver a memória" }, { status: user ? 403 : 401 });
    const allowedUnits = visibleAiTrainingUnits(user!);
    const memoryUnits = [...allowedUnits, "Todas"];
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const unit = searchParams.get("unit");
    if (unit && !memoryUnits.includes(unit)) return NextResponse.json({ error: "Sem acesso a esta unidade" }, { status: 403 });
    const where = {
      unit: unit ? unit : { in: memoryUnits },
      ...(status && ["pending", "approved", "rejected"].includes(status) ? { status } : {}),
    };
    const [memories, counts] = await Promise.all([
      prisma.aiTrainingMemory.findMany({
        where,
        select: {
          id: true,
          unit: true,
          sourceType: true,
          triggerText: true,
          originalAnswer: true,
          correctedAnswer: true,
          category: true,
          status: true,
          riskFlags: true,
          createdByName: true,
          reviewedByName: true,
          reviewedAt: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { updatedAt: "desc" },
        take: 120,
      }),
      prisma.aiTrainingMemory.groupBy({
        by: ["status"],
        where: { unit: unit ? unit : { in: memoryUnits } },
        _count: { _all: true },
      }),
    ]);
    return NextResponse.json({ memories, counts, allowedUnits: memoryUnits, isAdmin: user!.isAdmin });
  } catch (error: unknown) {
    console.error("[GET /api/crm/ai-shadow/training/memory]", error);
    return NextResponse.json({ error: "Falha ao carregar memória", details: errorMessage(error) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = getUserFromHeaders(req);
    if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    if (!user.isAdmin) return NextResponse.json({ error: "Somente administradores podem aprovar a memória" }, { status: 403 });
    const body = await req.json().catch(() => ({}));
    const id = typeof body.id === "string" ? body.id : "";
    const action = typeof body.action === "string" ? body.action : "";
    if (!id) return NextResponse.json({ error: "Memória obrigatória" }, { status: 400 });
    if (action === "update") {
      const correctedAnswer = typeof body.correctedAnswer === "string" ? body.correctedAnswer.trim().slice(0, 4000) : "";
      if (!correctedAnswer) return NextResponse.json({ error: "A resposta corrigida é obrigatória" }, { status: 400 });
      const memory = await prisma.aiTrainingMemory.update({
        where: { id },
        data: {
          correctedAnswer,
          status: "pending",
          reviewedById: null,
          reviewedByName: null,
          reviewedAt: null,
        },
      });
      return NextResponse.json({ memory });
    }
    const status = action === "approve" ? "approved" : action === "reject" ? "rejected" : "";
    if (!status) return NextResponse.json({ error: "Ação inválida" }, { status: 400 });
    const memory = await prisma.aiTrainingMemory.update({
      where: { id },
      data: {
        status,
        reviewedById: user.userId,
        reviewedByName: user.name || user.email,
        reviewedAt: new Date(),
      },
    });
    return NextResponse.json({ memory });
  } catch (error: unknown) {
    console.error("[PATCH /api/crm/ai-shadow/training/memory]", error);
    return NextResponse.json({ error: "Falha ao revisar memória", details: errorMessage(error) }, { status: 500 });
  }
}
