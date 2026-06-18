import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const unit = searchParams.get('unit');
    const category = searchParams.get('category');

    const where: Record<string, unknown> = { active: true };

    if (unit) {
      where.OR = [{ unit }, { unit: null }];
    }

    if (category) {
      where.category = category;
    }

    const templates = await prisma.docTemplate.findMany({
      where,
      select: {
        id: true,
        name: true,
        category: true,
        description: true,
        fields: true,
        unit: true,
        createdBy: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(templates);
  } catch (error) {
    console.error('Error fetching templates:', error);
    return NextResponse.json(
      { error: 'Erro ao buscar templates' },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, category, description, pdfData, fields, unit, createdBy } = body;

    if (!name || !category || !pdfData || !fields || !createdBy) {
      return NextResponse.json(
        { error: 'Campos obrigatórios: name, category, pdfData, fields, createdBy' },
        { status: 400 }
      );
    }

    const template = await prisma.docTemplate.create({
      data: {
        name,
        category,
        description: description || null,
        pdfData,
        fields,
        unit: unit || null,
        createdBy,
        active: true,
      },
      select: {
        id: true,
        name: true,
        category: true,
        description: true,
        fields: true,
        unit: true,
        createdBy: true,
        createdAt: true,
      },
    });

    return NextResponse.json(template, { status: 201 });
  } catch (error) {
    console.error('Error creating template:', error);
    return NextResponse.json(
      { error: 'Erro ao criar template' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'ID do template é obrigatório' },
        { status: 400 }
      );
    }

    await prisma.docTemplate.update({
      where: { id },
      data: { active: false },
    });

    return NextResponse.json({ success: true, message: 'Template desativado com sucesso' });
  } catch (error) {
    console.error('Error deleting template:', error);
    return NextResponse.json(
      { error: 'Erro ao desativar template' },
      { status: 500 }
    );
  }
}
