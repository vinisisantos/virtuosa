import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { phoneLookupKey } from '@/lib/phone';
import { requireUnitGuard, UnitAccessDeniedError, unitAccessDeniedResponse } from '@/lib/unit-guard';
import { getInstancesForRequest } from '@/lib/whatsapp/instance-resolver';
import {
  createConversationForInstance,
  findConversationByPhone,
} from '@/lib/whatsapp/conversation-starter';

function conversationUrl(params: { conversationId: string; instanceId?: string | null; unit?: string | null }) {
  const searchParams = new URLSearchParams({ conversationId: params.conversationId });
  if (params.instanceId) searchParams.set('targetInstanceId', params.instanceId);
  if (params.unit && !params.instanceId) searchParams.set('unit', params.unit);
  return `/crm/inbox?${searchParams.toString()}`;
}

function hasExplicitOwnerSelector(req: NextRequest) {
  const searchParams = new URL(req.url).searchParams;
  return !!(searchParams.get('targetUserId') || searchParams.get('targetInstanceId'));
}

export async function GET(req: NextRequest) {
  const guard = requireUnitGuard(req, { requestedUnit: new URL(req.url).searchParams.get('unit') });
  if (guard instanceof NextResponse) return guard;

  try {
    const { searchParams } = new URL(req.url);
    const dealId = searchParams.get('dealId') || searchParams.get('id');
    const shouldCreate = searchParams.get('create') === '1';
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

    if (guard.isAdmin && !hasExplicitOwnerSelector(req)) {
      const conversation = await findConversationByPhone({ phone });
      if (!conversation) {
        return NextResponse.json({
          available: false,
          reason: 'Selecione um usuario ou instancia para iniciar uma nova conversa',
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
    const operationalInstances = instances.filter((instance) => instance.status !== 'archived');
    const connectedInstance = operationalInstances.find((instance) => instance.status === 'connected');
    const instanceIds = operationalInstances.map((instance) => instance.id).filter(Boolean);
    if (!operationalInstances.length) {
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
        targetInstanceId: conversation.instanceId,
        url: conversationUrl({ conversationId: conversation.id, instanceId: conversation.instanceId, unit: deal.unit }),
      });
    }

    if (!connectedInstance) {
      return NextResponse.json({
        available: false,
        reason: 'Conecte seu WhatsApp antes de iniciar uma nova conversa',
      });
    }

    if (shouldCreate) {
      const newConversation = await createConversationForInstance({
        instanceId: connectedInstance.id,
        phone,
        contactName: deal.clientName,
        unit: deal.unit,
      });

      return NextResponse.json({
        available: true,
        created: true,
        conversationId: newConversation.id,
        targetInstanceId: newConversation.instanceId,
        url: conversationUrl({ conversationId: newConversation.id, instanceId: newConversation.instanceId, unit: deal.unit }),
      });
    }

    const anyConversation = await findConversationByPhone({ phone });
    return NextResponse.json({
      available: true,
      canCreate: true,
      reason: anyConversation
        ? 'Nova conversa via seu WhatsApp'
        : 'Iniciar conversa via seu WhatsApp',
    });
  } catch (error) {
    console.error('[Pipeline] Chat link error:', error);
    return NextResponse.json({ available: false, reason: 'Falha ao resolver conversa' }, { status: 500 });
  }
}
