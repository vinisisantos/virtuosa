import { NextRequest } from "next/server";

import { prisma } from "@/lib/db";
import { phoneLookupKey } from "@/lib/phone";
import type { UnitGuardResult } from "@/lib/unit-guard";
import { getInstancesForRequest } from "@/lib/whatsapp/instance-resolver";

export type PipelineOwnerScope = {
  ownerUserId: string;
  instanceIds: string[];
  phoneKeys: Set<string>;
};

type PipelineDealForOwner = {
  clientId: string;
  clientName: string;
  assignedTo?: string | null;
};

function hasExplicitOwnerSelector(req: NextRequest) {
  const searchParams = new URL(req.url).searchParams;
  return !!(searchParams.get("targetUserId") || searchParams.get("targetInstanceId"));
}

export async function resolvePipelineOwnerScope(
  req: NextRequest,
  guard: UnitGuardResult,
): Promise<PipelineOwnerScope | null> {
  if (guard.isAdmin && !hasExplicitOwnerSelector(req)) return null;

  const { instances, targetUserId } = await getInstancesForRequest(req);
  const ownerUserId = targetUserId || guard.userId;
  const instanceIds = instances.map((instance) => instance.id).filter(Boolean);

  if (!ownerUserId) {
    return { ownerUserId: "", instanceIds: [], phoneKeys: new Set() };
  }

  const conversations = instanceIds.length
    ? await prisma.whatsAppConversation.findMany({
        where: { instanceId: { in: instanceIds } },
        select: { contact: { select: { phone: true } } },
      })
    : [];

  const phoneKeys = new Set<string>();
  for (const conversation of conversations) {
    const key = phoneLookupKey(conversation.contact.phone);
    if (key) phoneKeys.add(key);
  }

  return { ownerUserId, instanceIds, phoneKeys };
}

export async function filterDealsByPipelineOwnerScope<T extends PipelineDealForOwner>(
  deals: T[],
  scope: PipelineOwnerScope | null,
): Promise<T[]> {
  if (!scope) return deals;
  if (!scope.ownerUserId) return [];
  if (!deals.length) return deals;

  const clientIds = [...new Set(deals.map((deal) => deal.clientId).filter(Boolean))];
  const clients = clientIds.length
    ? await prisma.client.findMany({
        where: { id: { in: clientIds } },
        select: { id: true, phone: true },
      })
    : [];
  const clientPhoneById = new Map(clients.map((client) => [client.id, client.phone]));

  return deals.filter((deal) => {
    // Leads criados pelo webhook do WhatsApp gravam o dono da instância como
    // assignedTo; aqui esse campo é uma projeção do dono da instância, não uma
    // atribuição manual do Pipeline.
    if (deal.assignedTo) return deal.assignedTo === scope.ownerUserId;

    const key = phoneLookupKey(clientPhoneById.get(deal.clientId) || deal.clientName);
    return !!key && scope.phoneKeys.has(key);
  });
}

export async function canAccessPipelineDeal(
  deal: PipelineDealForOwner,
  scope: PipelineOwnerScope | null,
) {
  if (!scope) return true;
  const visible = await filterDealsByPipelineOwnerScope([deal], scope);
  return visible.length > 0;
}
