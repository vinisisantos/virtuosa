import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { hasPermission, requireAuth } from "@/lib/auth";

async function requireStageManager(req: NextRequest) {
  const auth = await requireAuth(req);
  if ("error" in auth) return auth.error;
  if (!hasPermission(auth.user, "crmPipelineStages")) {
    return NextResponse.json({ error: "Sem permissão para gerenciar colunas do pipeline" }, { status: 403 });
  }
  return null;
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; stageId: string }> }
) {
  const denied = await requireStageManager(req);
  if (denied) return denied;

  try {
    const { id, stageId } = await params;
    const body = await req.json();
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const color = typeof body.color === "string" ? body.color : undefined;

    if (!name) {
      return NextResponse.json({ error: "Nome da coluna é obrigatório" }, { status: 400 });
    }

    const existing = await prisma.pipelineStage.findFirst({
      where: { id: stageId, pipelineId: id },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Coluna não encontrada" }, { status: 404 });
    }

    const updated = await prisma.pipelineStage.update({
      where: { id: stageId },
      data: {
        name,
        ...(color ? { color } : {}),
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Error updating stage:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; stageId: string }> }
) {
  const denied = await requireStageManager(req);
  if (denied) return denied;

  try {
    const { stageId } = await params;
    const count = await prisma.salesPipeline.count({
      where: { stageId },
    });

    if (count > 0) {
      return NextResponse.json(
        { error: "Cannot delete stage with existing deals. Move or delete them first." },
        { status: 400 }
      );
    }

    await prisma.pipelineStage.delete({
      where: { id: stageId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting stage:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
