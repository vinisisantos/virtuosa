import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { name } = body;

    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const updated = await prisma.pipeline.update({
      where: { id },
      data: { name },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Error updating pipeline:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    // Optional: check if deals exist and prevent delete
    const count = await prisma.salesPipeline.count({
      where: { pipelineId: id },
    });

    if (count > 0) {
      return NextResponse.json(
        { error: "Cannot delete pipeline with existing deals" },
        { status: 400 }
      );
    }

    await prisma.pipeline.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting pipeline:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
