import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// GET /api/whatsapp/canned-responses?unit=SCS
export async function GET(req: NextRequest) {
  try {
    const unit = req.nextUrl.searchParams.get('unit');
    const responses = await prisma.cannedResponse.findMany({
      where: unit ? { OR: [{ unit }, { unit: null }] } : {},
      orderBy: { shortCode: 'asc' },
    });
    return NextResponse.json({ responses });
  } catch (error) {
    console.error('[canned-responses] GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 });
  }
}

// POST /api/whatsapp/canned-responses
export async function POST(req: NextRequest) {
  try {
    const { shortCode, title, content, unit, createdBy } = await req.json();
    if (!shortCode || !title || !content) {
      return NextResponse.json({ error: 'shortCode, title, and content are required' }, { status: 400 });
    }
    const response = await prisma.cannedResponse.create({
      data: { shortCode: shortCode.toLowerCase().replace(/\s+/g, '_'), title, content, unit: unit || null, createdBy },
    });
    return NextResponse.json({ response });
  } catch (error: any) {
    if (error?.code === 'P2002') {
      return NextResponse.json({ error: 'Atalho já existe para esta unidade' }, { status: 409 });
    }
    console.error('[canned-responses] POST error:', error);
    return NextResponse.json({ error: 'Failed to create' }, { status: 500 });
  }
}

// PUT /api/whatsapp/canned-responses
export async function PUT(req: NextRequest) {
  try {
    const { id, shortCode, title, content, unit } = await req.json();
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
    const response = await prisma.cannedResponse.update({
      where: { id },
      data: {
        ...(shortCode && { shortCode: shortCode.toLowerCase().replace(/\s+/g, '_') }),
        ...(title && { title }),
        ...(content && { content }),
        ...(unit !== undefined && { unit: unit || null }),
      },
    });
    return NextResponse.json({ response });
  } catch (error) {
    console.error('[canned-responses] PUT error:', error);
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
  }
}

// DELETE /api/whatsapp/canned-responses?id=xxx
export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
    await prisma.cannedResponse.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[canned-responses] DELETE error:', error);
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 });
  }
}
