import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";

export async function GET() {
  try {
    const pipelines = await prisma.pipeline.findMany({
      include: {
        stages: {
          orderBy: { position: "asc" },
        },
      },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json(pipelines);
  } catch (error) {
    console.error("Error fetching pipelines:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, unit } = body;

    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const pipeline = await prisma.pipeline.create({
      data: {
        name,
        unit: unit || "Barueri",
      },
    });

    // Create default stages
    const defaultStages = [
      { name: "Novo Lead", color: "#3b82f6", position: 0 },
      { name: "Em Atendimento", color: "#eab308", position: 1 },
      { name: "Em Negociação", color: "#f97316", position: 2 },
      { name: "Fechado", color: "#22c55e", position: 3 },
      { name: "Perdido", color: "#ef4444", position: 4 },
    ];

    await prisma.pipelineStage.createMany({
      data: defaultStages.map((s) => ({
        ...s,
        pipelineId: pipeline.id,
      })),
    });

    const newPipeline = await prisma.pipeline.findUnique({
      where: { id: pipeline.id },
      include: {
        stages: {
          orderBy: { position: "asc" },
        },
      },
    });

    return NextResponse.json(newPipeline);
  } catch (error) {
    console.error("Error creating pipeline:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
