import { NextRequest, NextResponse } from 'next/server';
import { prisma } from "@/lib/db";
import { requireUnitGuard } from '@/lib/unit-guard';
import {
  ContratoLayoutError,
  MODELO_CONTRATO_SBC_VALIDADO,
  validarLayoutContrato,
  validarPartesProtegidasContrato,
  validarTagsContrato,
} from '@/lib/contratos/validarLayoutContrato';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const template = await prisma.docTemplate.findUnique({
      where: { id },
    });

    if (!template) {
      return NextResponse.json(
        { error: 'Template não encontrado' },
        { status: 404 }
      );
    }

    return NextResponse.json(template, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    console.error('Error fetching template:', error);
    return NextResponse.json(
      { error: 'Erro ao buscar template' },
      { status: 500 }
    );
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = requireUnitGuard(req, { allowAdminOverride: false });
  if (guard instanceof NextResponse) return guard;
  if (!guard.isAdmin && guard.permissions?.termos !== true) {
    return NextResponse.json({ error: 'Permissão insuficiente para editar modelos.' }, { status: 403 });
  }

  try {
    const { id } = await params;
    const template = await prisma.docTemplate.findUnique({ where: { id } });
    if (!template || !template.active) {
      return NextResponse.json({ error: 'Modelo ativo não encontrado.' }, { status: 404 });
    }

    try {
      guard.enforceUnit(template.unit);
    } catch {
      return NextResponse.json({ error: 'Você não pode editar modelos de outra unidade.' }, { status: 403 });
    }
    if (!template.unit && !guard.isAdmin) {
      return NextResponse.json({ error: 'Somente um administrador pode editar um modelo compartilhado.' }, { status: 403 });
    }
    if (template.category !== 'contrato_trabalho') {
      return NextResponse.json({ error: 'A edição no preview está disponível somente para modelos de contrato.' }, { status: 415 });
    }
    if (template.fileType !== 'docx') {
      return NextResponse.json({ error: 'Somente modelos DOCX podem ser editados no preview.' }, { status: 415 });
    }

    const body: unknown = await req.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Dados de atualização inválidos.' }, { status: 400 });
    }
    const { fileData, expectedUpdatedAt } = body as { fileData?: unknown; expectedUpdatedAt?: unknown };
    if (typeof expectedUpdatedAt !== 'string' || Date.parse(expectedUpdatedAt) !== template.updatedAt.getTime()) {
      return NextResponse.json({ error: 'Este modelo foi atualizado por outra pessoa. Recarregue a página antes de salvar.' }, { status: 409 });
    }
    if (typeof fileData !== 'string' || !/^UEsDB[A-Za-z0-9+/]*={0,2}$/.test(fileData)) {
      return NextResponse.json({ error: 'Arquivo DOCX inválido.' }, { status: 400 });
    }
    if (fileData.length > 8_000_000) {
      return NextResponse.json({ error: 'O modelo ultrapassa o limite de 6 MB.' }, { status: 413 });
    }

    try {
      const original = Buffer.from(template.fileData, 'base64');
      const updated = Buffer.from(fileData, 'base64');
      await validarTagsContrato(original, updated);
      if (template.id === MODELO_CONTRATO_SBC_VALIDADO) {
        await validarLayoutContrato(updated);
        await validarPartesProtegidasContrato(original, updated);
      }
    } catch (error) {
      console.error('Edição do modelo bloqueada:', error);
      return NextResponse.json({
        error: error instanceof Error ? error.message : 'O modelo alterado não passou na validação.',
        violations: error instanceof ContratoLayoutError ? error.violations : undefined,
      }, { status: 422 });
    }

    const result = await prisma.docTemplate.updateMany({
      where: { id, active: true, updatedAt: template.updatedAt },
      data: { fileData },
    });
    if (result.count !== 1) {
      return NextResponse.json({ error: 'Este modelo foi atualizado por outra pessoa. Recarregue a página antes de salvar.' }, { status: 409 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating template:', error);
    return NextResponse.json({ error: 'Erro ao atualizar modelo' }, { status: 500 });
  }
}
