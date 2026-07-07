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
    const actor = await requireAuth(req);
    if ("error" in actor) return actor.error;

    const { id, stageId } = await params;
    const existing = await prisma.pipelineStage.findFirst({
      where: { id: stageId, pipelineId: id },
      select: { id: true, name: true, position: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Coluna não encontrada" }, { status: 404 });
    }

    const stageCount = await prisma.pipelineStage.count({ where: { pipelineId: id } });
    if (stageCount <= 1) {
      return NextResponse.json(
        { error: "O funil precisa ter pelo menos uma coluna." },
        { status: 400 }
      );
    }

    const count = await prisma.salesPipeline.count({
      where: { stageId },
    });

    if (count > 0) {
      return NextResponse.json(
        { error: "Não é possível excluir uma coluna com negócios. Mova ou exclua os negócios primeiro." },
        { status: 400 }
      );
    }

    await prisma.$transaction([
      prisma.pipelineStage.delete({ where: { id: stageId } }),
      prisma.pipelineStage.updateMany({
        where: {
          pipelineId: id,
          position: { gt: existing.position },
        },
        data: { position: { decrement: 1 } },
      }),
    ]);

    await prisma.auditLog.create({
      data: {
        userName: actor.user.name || "Sistema",
        action: "delete",
        entity: "pipeline_stage",
        entityId: stageId,
        details: `Coluna do pipeline excluída: ${existing.name}`,
        unit: actor.user.unit || undefined,
      },
    }).catch(() => {});

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting stage:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
