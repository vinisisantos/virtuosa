import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// GET — list adiantamentos (optional ?status=pendente|finalizado)
export async function GET(req: NextRequest) {
  try {
    const status = req.nextUrl.searchParams.get('status');
    const where = status && status !== 'all' ? { status } : {};
    const items = await prisma.adiantamento.findMany({
      where,
      orderBy: { recipient: 'asc' },
    });
    return NextResponse.json({ items });
  } catch (err) {
    console.error('GET adiantamento error:', err);
    return NextResponse.json({ error: 'Erro ao buscar adiantamentos' }, { status: 500 });
  }
}

// POST — create new adiantamento
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { description, value, recipient, unit, notes, isRecurring } = body;
    if (!description?.trim() || !value || !recipient?.trim()) {
      return NextResponse.json({ error: 'Descrição, valor e beneficiário são obrigatórios' }, { status: 400 });
    }
    const item = await prisma.adiantamento.create({
      data: {
        description: description.trim(),
        value: parseFloat(value),
        recipient: recipient.trim(),
        unit: unit || 'Barueri',
        notes: notes?.trim() || null,
        isRecurring: isRecurring === true,
      },
    });
    return NextResponse.json(item, { status: 201 });
  } catch (err) {
    console.error('POST adiantamento error:', err);
    return NextResponse.json({ error: 'Erro ao criar adiantamento' }, { status: 500 });
  }
}

// PUT — edit adiantamento
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, description, value, recipient, unit, notes, isRecurring } = body;
    if (!id) return NextResponse.json({ error: 'ID obrigatório' }, { status: 400 });
    const data: any = {};
    if (description !== undefined) data.description = description.trim();
    if (value !== undefined) data.value = parseFloat(value);
    if (recipient !== undefined) data.recipient = recipient.trim();
    if (unit !== undefined) data.unit = unit;
    if (notes !== undefined) data.notes = notes?.trim() || null;
    if (isRecurring !== undefined) data.isRecurring = isRecurring === true;
    const item = await prisma.adiantamento.update({ where: { id }, data });
    return NextResponse.json(item);
  } catch (err) {
    console.error('PUT adiantamento error:', err);
    return NextResponse.json({ error: 'Erro ao editar adiantamento' }, { status: 500 });
  }
}

// PATCH — toggle status (pendente <-> finalizado)
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, status } = body;
    if (!id || !['pendente', 'finalizado'].includes(status)) {
      return NextResponse.json({ error: 'ID e status válido são obrigatórios' }, { status: 400 });
    }
    const item = await prisma.adiantamento.update({
      where: { id },
      data: {
        status,
        finalizedAt: status === 'finalizado' ? new Date() : null,
      },
    });
    return NextResponse.json(item);
  } catch (err) {
    console.error('PATCH adiantamento error:', err);
    return NextResponse.json({ error: 'Erro ao atualizar status' }, { status: 500 });
  }
}

// DELETE — remove adiantamento
export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'ID obrigatório' }, { status: 400 });
    await prisma.adiantamento.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE adiantamento error:', err);
    return NextResponse.json({ error: 'Erro ao remover adiantamento' }, { status: 500 });
  }
}
