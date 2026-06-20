import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// GET /api/crm/flows — listar flows
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const unit = searchParams.get("unit");
    const status = searchParams.get("status");

    const where: Record<string, unknown> = {};
    if (unit) where.unit = unit;
    if (status) where.status = status;

    const flows = await prisma.flow.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        name: true,
        description: true,
        status: true,
        triggerType: true,
        triggerConfig: true,
        executionCount: true,
        lastExecutedAt: true,
        createdBy: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { runs: true } },
      },
    });

    return NextResponse.json({ flows });
  } catch (error) {
    console.error("[GET /api/crm/flows]", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

// POST /api/crm/flows — criar flow
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, description, triggerType, triggerConfig, nodes, edges, status, createdBy, unit } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: "Nome é obrigatório" }, { status: 400 });
    }

    const flow = await prisma.flow.create({
      data: {
        name: name.trim(),
        description: description || null,
        triggerType: triggerType || "keyword",
        triggerConfig: triggerConfig || null,
        nodes: nodes || [],
        edges: edges || [],
        status: status || "draft",
        createdBy: createdBy || null,
        unit: unit || null,
      },
    });

    return NextResponse.json({ flow }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/crm/flows]", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

// PUT /api/crm/flows — atualizar flow
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, ...data } = body;

    if (!id) return NextResponse.json({ error: "ID é obrigatório" }, { status: 400 });

    const flow = await prisma.flow.update({
      where: { id },
      data,
    });

    return NextResponse.json({ flow });
  } catch (error) {
    console.error("[PUT /api/crm/flows]", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

// DELETE /api/crm/flows?id=xxx
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "ID obrigatório" }, { status: 400 });

    await prisma.flow.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/crm/flows]", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
