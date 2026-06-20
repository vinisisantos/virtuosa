import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function PUT(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
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
          pipelineId: params.id,
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
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const body = await req.json();
    const { name, color, position } = body;

    const newStage = await prisma.pipelineStage.create({
      data: {
        pipelineId: params.id,
        name,
        color: color || "#3b82f6",
        position: position || 0,
      },
    });

    return NextResponse.json(newStage);
  } catch (error) {
    console.error("Error creating stage:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
