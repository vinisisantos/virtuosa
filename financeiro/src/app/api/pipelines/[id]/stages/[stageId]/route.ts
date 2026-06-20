import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string; stageId: string }> }
) {
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
