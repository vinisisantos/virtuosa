import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { phoneLookupKey } from '@/lib/phone';
import { requireUnitGuard, UnitAccessDeniedError, unitAccessDeniedResponse } from '@/lib/unit-guard';
import { getInstancesForRequest } from '@/lib/whatsapp/instance-resolver';

function conversationUrl(params: { conversationId: string; instanceId?: string | null; unit?: string | null }) {
  const searchParams = new URLSearchParams({ conversationId: params.conversationId });
  if (params.instanceId) searchParams.set('targetInstanceId', params.instanceId);
  if (params.unit && !params.instanceId) searchParams.set('unit', params.unit);
  return `/crm/inbox?${searchParams.toString()}`;
}

function contactPhoneConditions(phone: string) {
  const digits = phone.replace(/\D/g, '');
  const suffix = digits.slice(-8);
  return [
    { phone },
    ...(digits ? [{ phone: { contains: digits } }] : []),
    ...(suffix.length >= 8 ? [{ phone: { contains: suffix } }] : []),
  ];
}

async function findConversationByPhone(params: {
  phone: string;
  instanceIds?: string[];
  includeArchivedInstances?: boolean;
}) {
  const phoneKey = phoneLookupKey(params.phone);
  if (!phoneKey) return null;

  const conversations = await prisma.whatsAppConversation.findMany({
    where: {
      ...(params.instanceIds ? { instanceId: { in: params.instanceIds } } : {}),
      ...(!params.includeArchivedInstances ? { instance: { status: { not: 'archived' } } } : {}),
      contact: {
        OR: contactPhoneConditions(params.phone),
      },
    },
    select: {
      id: true,
      instanceId: true,
      lastMessageAt: true,
      updatedAt: true,
      contact: { select: { phone: true } },
    },
    orderBy: [{ lastMessageAt: 'desc' }, { updatedAt: 'desc' }],
    take: 30,
  });

  return conversations.find((conversation) => phoneLookupKey(conversation.contact.phone) === phoneKey) || null;
}

export async function GET(req: NextRequest) {
  const guard = requireUnitGuard(req, { requestedUnit: new URL(req.url).searchParams.get('unit') });
  if (guard instanceof NextResponse) return guard;

  try {
    const { searchParams } = new URL(req.url);
    const dealId = searchParams.get('dealId') || searchParams.get('id');
    if (!dealId) {
      return NextResponse.json({ available: false, reason: 'Oportunidade nao informada' }, { status: 400 });
    }

    const deal = await prisma.salesPipeline.findUnique({
      where: { id: dealId },
      select: { id: true, clientId: true, clientName: true, unit: true },
    });
    if (!deal) {
      return NextResponse.json({ available: false, reason: 'Oportunidade nao encontrada' }, { status: 404 });
    }

    try {
      guard.enforceUnit(deal.unit);
    } catch (error) {
      if (error instanceof UnitAccessDeniedError) return unitAccessDeniedResponse();
      throw error;
    }

    const client = deal.clientId
      ? await prisma.client.findUnique({
          where: { id: deal.clientId },
          select: { phone: true },
        })
      : null;
    const phone = client?.phone || deal.clientName;
    if (!phoneLookupKey(phone)) {
      return NextResponse.json({
        available: false,
        reason: 'Lead sem telefone vinculado ao WhatsApp',
      });
    }

    if (guard.isAdmin) {
      const conversation = await findConversationByPhone({ phone });
      if (!conversation) {
        return NextResponse.json({
          available: false,
          reason: 'Nenhuma conversa de WhatsApp encontrada para este telefone',
        });
      }

      return NextResponse.json({
        available: true,
        conversationId: conversation.id,
        targetInstanceId: conversation.instanceId,
        url: conversationUrl({ conversationId: conversation.id, instanceId: conversation.instanceId }),
      });
    }

    const { instances } = await getInstancesForRequest(req);
    const instanceIds = instances.map((instance) => instance.id).filter(Boolean);
    if (!instanceIds.length) {
      return NextResponse.json({
        available: false,
        reason: 'Nenhuma instancia de WhatsApp disponivel para seu usuario',
      });
    }

    const conversation = await findConversationByPhone({ phone, instanceIds });
    if (conversation) {
      return NextResponse.json({
        available: true,
        conversationId: conversation.id,
        url: conversationUrl({ conversationId: conversation.id, unit: deal.unit }),
      });
    }

    const anyConversation = await findConversationByPhone({ phone });
    return NextResponse.json({
      available: false,
      reason: anyConversation
        ? 'Chat indisponivel nas suas instancias de WhatsApp'
        : 'Nenhuma conversa de WhatsApp encontrada para este telefone',
    });
  } catch (error) {
    console.error('[Pipeline] Chat link error:', error);
    return NextResponse.json({ available: false, reason: 'Falha ao resolver conversa' }, { status: 500 });
  }
}
