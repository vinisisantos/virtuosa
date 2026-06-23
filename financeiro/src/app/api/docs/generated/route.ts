import { NextResponse } from 'next/server';
import { prisma } from "@/lib/db";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const unit = searchParams.get('unit');
    const templateId = searchParams.get('templateId');
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.max(1, Math.min(100, parseInt(searchParams.get('limit') || '20', 10)));
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};

    if (unit) {
      where.unit = unit;
    }

    if (templateId) {
      where.templateId = templateId;
    }

    const [records, total] = await Promise.all([
      prisma.docGenerated.findMany({
        where,
        select: {
          id: true,
          templateId: true,
          templateName: true,
          filledData: true,
          unit: true,
          createdBy: true,
          createdByName: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.docGenerated.count({ where }),
    ]);

    return NextResponse.json({
      documents: records,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error('Error fetching generated docs:', error);
    return NextResponse.json(
      { error: 'Erro ao buscar documentos gerados' },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { templateId, templateName, filledData, fileData, unit, createdBy, createdByName } = body;

    if (!templateId || !templateName || !filledData || !createdBy || !createdByName) {
      return NextResponse.json(
        { error: 'Campos obrigatórios: templateId, templateName, filledData, createdBy, createdByName' },
        { status: 400 }
      );
    }

    const doc = await prisma.docGenerated.create({
      data: {
        templateId,
        templateName,
        filledData,
        fileData: fileData || null,
        unit: unit || null,
        createdBy,
        createdByName,
      },
      select: { id: true },
    });

    return NextResponse.json({ id: doc.id, success: true }, { status: 201 });
  } catch (error) {
    console.error('Error creating generated doc:', error);
    return NextResponse.json(
      { error: 'Erro ao salvar documento gerado' },
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
        { error: 'ID do documento é obrigatório' },
        { status: 400 }
      );
    }

    await prisma.docGenerated.delete({
      where: { id },
    });

    return NextResponse.json({ success: true, message: 'Documento excluído com sucesso' });
  } catch (error) {
    console.error('Error deleting generated doc:', error);
    return NextResponse.json(
      { error: 'Erro ao excluir documento' },
      { status: 500 }
    );
  }
}
