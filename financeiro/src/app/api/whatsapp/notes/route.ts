import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// GET /api/whatsapp/notes?conversationId=xxx
export async function GET(req: NextRequest) {
  try {
    const conversationId = req.nextUrl.searchParams.get('conversationId');
    if (!conversationId) return NextResponse.json({ error: 'conversationId required' }, { status: 400 });
    const notes = await prisma.conversationNote.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json({ notes });
  } catch (error) {
    console.error('[notes] GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 });
  }
}

// POST /api/whatsapp/notes
export async function POST(req: NextRequest) {
  try {
    const { conversationId, content, authorName, authorId } = await req.json();
    if (!conversationId || !content || !authorName) {
      return NextResponse.json({ error: 'conversationId, content, and authorName required' }, { status: 400 });
    }
    const note = await prisma.conversationNote.create({
      data: { conversationId, content, authorName, authorId },
    });
    return NextResponse.json({ note });
  } catch (error) {
    console.error('[notes] POST error:', error);
    return NextResponse.json({ error: 'Failed to create' }, { status: 500 });
  }
}

// DELETE /api/whatsapp/notes?id=xxx
export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
    await prisma.conversationNote.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[notes] DELETE error:', error);
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 });
  }
}
