import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// GET /api/whatsapp/labels?conversationId=xxx OR ?action=definitions[&unit=SCS]
export async function GET(req: NextRequest) {
  try {
    const action = req.nextUrl.searchParams.get('action');
    const conversationId = req.nextUrl.searchParams.get('conversationId');
    const unit = req.nextUrl.searchParams.get('unit');

    if (action === 'definitions') {
      const definitions = await prisma.labelDefinition.findMany({
        where: unit ? { OR: [{ unit }, { unit: null }] } : {},
        orderBy: { name: 'asc' },
      });
      return NextResponse.json({ definitions });
    }

    if (conversationId) {
      const labels = await prisma.conversationLabel.findMany({
        where: { conversationId },
        orderBy: { createdAt: 'asc' },
      });
      return NextResponse.json({ labels });
    }

    // Bulk fetch: get labels for multiple conversations
    const conversationIds = req.nextUrl.searchParams.get('conversationIds');
    if (conversationIds) {
      const ids = conversationIds.split(',').filter(Boolean);
      const labels = await prisma.conversationLabel.findMany({
        where: { conversationId: { in: ids } },
      });
      // Group by conversationId
      const grouped: Record<string, typeof labels> = {};
      for (const l of labels) {
        if (!grouped[l.conversationId]) grouped[l.conversationId] = [];
        grouped[l.conversationId].push(l);
      }
      return NextResponse.json({ labelsByConversation: grouped });
    }

    return NextResponse.json({ error: 'conversationId or action required' }, { status: 400 });
  } catch (error) {
    console.error('[labels] GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 });
  }
}

// POST /api/whatsapp/labels
// body: { conversationId, label, color, unit } OR { action: "create_definition", name, color, icon, unit }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (body.action === 'create_definition') {
      const def = await prisma.labelDefinition.create({
        data: { name: body.name, color: body.color || '#6366f1', icon: body.icon, unit: body.unit },
      });
      return NextResponse.json({ definition: def });
    }

    const { conversationId, label, color, unit } = body;
    if (!conversationId || !label) {
      return NextResponse.json({ error: 'conversationId and label required' }, { status: 400 });
    }

    // Ensure label definition exists
    await prisma.labelDefinition.upsert({
      where: { name: label },
      update: {},
      create: { name: label, color: color || '#6366f1', unit },
    });

    const convLabel = await prisma.conversationLabel.create({
      data: { conversationId, label, color: color || '#6366f1', unit },
    });
    return NextResponse.json({ label: convLabel });
  } catch (error: any) {
    if (error?.code === 'P2002') {
      return NextResponse.json({ error: 'Label já aplicada nesta conversa' }, { status: 409 });
    }
    console.error('[labels] POST error:', error);
    return NextResponse.json({ error: 'Failed to create' }, { status: 500 });
  }
}

// DELETE /api/whatsapp/labels?id=xxx OR ?conversationId=xxx&label=yyy
// OR body: { action: "delete_definition", id: "xxx" }
export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get('id');
    const conversationId = req.nextUrl.searchParams.get('conversationId');
    const label = req.nextUrl.searchParams.get('label');

    if (id) {
      await prisma.conversationLabel.delete({ where: { id } });
      return NextResponse.json({ ok: true });
    }

    if (conversationId && label) {
      await prisma.conversationLabel.deleteMany({
        where: { conversationId, label },
      });
      return NextResponse.json({ ok: true });
    }

    // Try body for definition delete
    try {
      const body = await req.json();
      if (body.action === 'delete_definition' && body.id) {
        await prisma.labelDefinition.delete({ where: { id: body.id } });
        return NextResponse.json({ ok: true });
      }
    } catch {}

    return NextResponse.json({ error: 'id or conversationId+label required' }, { status: 400 });
  } catch (error) {
    console.error('[labels] DELETE error:', error);
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 });
  }
}
