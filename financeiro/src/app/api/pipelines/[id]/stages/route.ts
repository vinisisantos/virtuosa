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
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireStageManager(req);
  if (denied) return denied;

  try {
    const { id } = await params;
    const body = await req.json();
    const { stages } = body;

    if (!Array.isArray(stages)) {
      return NextResponse.json({ error: "Stages must be an array" }, { status: 400 });
    }

    // Upsert each stage
    for (const stage of stages) {
      await prisma.pipelineStage.upsert({
        where: { id: stage.id || "new-id-placeholder" }, // Handle new stages if needed, or rely on POST
        update: {
          name: stage.name,
          color: stage.color,
          position: stage.position,
        },
        create: {
          id: stage.id,
          pipelineId: id,
          name: stage.name,
          color: stage.color,
          position: stage.position,
        },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating stages:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireStageManager(req);
  if (denied) return denied;

  try {
    const { id } = await params;
    const body = await req.json();
    const { name, color, position } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: "Nome da coluna é obrigatório" }, { status: 400 });
    }

    const resolvedPosition =
      typeof position === "number"
        ? position
        : (await prisma.pipelineStage.count({ where: { pipelineId: id } }));

    const newStage = await prisma.pipelineStage.create({
      data: {
        pipelineId: id,
        name: name.trim(),
        color: color || "#3b82f6",
        position: resolvedPosition,
      },
    });

    return NextResponse.json(newStage);
  } catch (error) {
    console.error("Error creating stage:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
