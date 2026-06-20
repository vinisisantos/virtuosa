import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// GET /api/crm/automations — listar automações
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const unit = searchParams.get("unit");

    const where: Record<string, unknown> = {};
    if (unit) where.unit = unit;

    const automations = await prisma.automation.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { logs: true } },
      },
    });

    return NextResponse.json({ automations });
  } catch (error) {
    console.error("[GET /api/crm/automations]", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

// POST /api/crm/automations — criar automação
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, description, triggerType, triggerConfig, steps, isActive, createdBy, unit } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: "Nome é obrigatório" }, { status: 400 });
    }
    if (!triggerType) {
      return NextResponse.json({ error: "Tipo de gatilho é obrigatório" }, { status: 400 });
    }
    if (!steps || !Array.isArray(steps) || steps.length === 0) {
      return NextResponse.json({ error: "Adicione pelo menos uma ação" }, { status: 400 });
    }

    const automation = await prisma.automation.create({
      data: {
        name: name.trim(),
        description: description || null,
        triggerType,
        triggerConfig: triggerConfig || null,
        steps,
        isActive: !!isActive,
        createdBy: createdBy || null,
        unit: unit || null,
      },
    });

    return NextResponse.json({ automation }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/crm/automations]", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

// PUT /api/crm/automations — atualizar automação
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, ...data } = body;

    if (!id) return NextResponse.json({ error: "ID é obrigatório" }, { status: 400 });

    const automation = await prisma.automation.update({
      where: { id },
      data,
    });

    return NextResponse.json({ automation });
  } catch (error) {
    console.error("[PUT /api/crm/automations]", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

// DELETE /api/crm/automations?id=xxx
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "ID obrigatório" }, { status: 400 });

    await prisma.automation.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/crm/automations]", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
