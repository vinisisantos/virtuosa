import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// GET — List all conversations (with last message preview + client data)
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');
  const unit = searchParams.get('unit');
  const assignedTo = searchParams.get('assignedTo');
  const conversationId = searchParams.get('id');
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '50');

  // If specific conversation requested, return it with messages + client data
  if (conversationId) {
    const conversation = await prisma.whatsAppConversation.findUnique({
      where: { id: conversationId },
      include: {
        messages: {
          orderBy: { timestamp: 'asc' },
          take: 200,
        },
      },
    });

    if (!conversation) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Mark as read
    await prisma.whatsAppConversation.update({
      where: { id: conversationId },
      data: { unreadCount: 0 },
    });

    // Fetch client data if linked
    let client = null;
    if (conversation.clientId) {
      client = await prisma.client.findUnique({
        where: { id: conversation.clientId },
      });
    }

    // Fetch pipeline data
    let pipeline = null;
    if (conversation.clientId) {
      pipeline = await prisma.salesPipeline.findFirst({
        where: {
          clientId: conversation.clientId,
          stage: { notIn: ['fechado', 'perdido'] },
        },
      });
    }

    return NextResponse.json({ ...conversation, client, pipeline });
  }

  // List all conversations
  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (unit) where.unit = unit;
  if (assignedTo) where.assignedTo = assignedTo;

  const [conversations, total] = await Promise.all([
    prisma.whatsAppConversation.findMany({
      where,
      orderBy: { lastMessageAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        messages: {
          orderBy: { timestamp: 'desc' },
          take: 1, // Last message for preview
        },
      },
    }),
    prisma.whatsAppConversation.count({ where }),
  ]);

  return NextResponse.json({
    conversations,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  });
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
