import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// GET — List all conversations (with last message preview)
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');
  const unit = searchParams.get('unit');
  const conversationId = searchParams.get('id');

  // If specific conversation requested, return it with messages
  if (conversationId) {
    const conversation = await prisma.whatsAppConversation.findUnique({
      where: { id: conversationId },
      include: {
        messages: {
          orderBy: { timestamp: 'asc' },
          take: 100,
        },
      },
    });

    if (!conversation) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Mark as read
    await prisma.whatsAppConversation.update({
      where: { id: conversationId },
      data: { unreadCount: 0 },
    });

    return NextResponse.json(conversation);
  }

  // List all conversations
  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (unit) where.unit = unit;

  const conversations = await prisma.whatsAppConversation.findMany({
    where,
    orderBy: { lastMessageAt: 'desc' },
    include: {
      messages: {
        orderBy: { timestamp: 'desc' },
        take: 1, // Last message for preview
      },
    },
  });

  return NextResponse.json(conversations);
}

// PUT — Update conversation (assign operator, change status, link to client)
export async function PUT(req: Request) {
  const body = await req.json();
  const { id, status, assignedTo, clientId, unit } = body;

  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });

  const updated = await prisma.whatsAppConversation.update({
    where: { id },
    data: {
      ...(status !== undefined && { status }),
      ...(assignedTo !== undefined && { assignedTo }),
      ...(clientId !== undefined && { clientId }),
      ...(unit !== undefined && { unit }),
    },
  });

  return NextResponse.json(updated);
}
