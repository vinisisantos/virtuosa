import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { pipelineEvaluationMarker } from "@/lib/evaluation-scheduling";

function normalizePhoneSuffix(value?: string | null) {
  return (value || "").replace(/\D/g, "").slice(-8);
}

export async function syncLeadNameAcrossCrm(params: {
  contactId: string;
  name: string;
  clientIds?: string[];
  phone?: string | null;
  unit?: string | null;
}) {
  return prisma.$transaction(async (tx) => {
    const contact = await tx.whatsAppContact.update({
      where: { id: params.contactId },
      data: { name: params.name },
      select: {
        id: true,
        phone: true,
        name: true,
        profilePic: true,
        tags: true,
        unit: true,
      },
    });

    let clientIds = Array.from(new Set(params.clientIds?.filter(Boolean) || []));
    if (clientIds.length === 0 && params.phone) {
      const suffix = normalizePhoneSuffix(params.phone);
      const where: Prisma.ClientWhereInput = {
        isActive: true,
        ...(params.unit ? { unit: params.unit } : {}),
        ...(suffix.length >= 8
          ? { phone: { contains: suffix } }
          : { phone: params.phone }),
      };
      const clients = await tx.client.findMany({
        where,
        select: { id: true },
      });
      clientIds = clients.map((client) => client.id);
    }

    if (clientIds.length === 0) {
      return {
        contact,
        updatedClients: 0,
        updatedDeals: 0,
        updatedEvaluations: 0,
      };
    }

    const deals = await tx.salesPipeline.findMany({
      where: { clientId: { in: clientIds } },
      select: { id: true },
    });
    const evaluationMarkers = deals.map((deal) => pipelineEvaluationMarker(deal.id));

    const [updatedClients, updatedDeals, updatedEvaluations] = await Promise.all([
      tx.client.updateMany({
        where: { id: { in: clientIds } },
        data: { name: params.name },
      }),
      tx.salesPipeline.updateMany({
        where: { clientId: { in: clientIds } },
        data: { clientName: params.name },
      }),
      evaluationMarkers.length > 0
        ? tx.agendamento.updateMany({
            where: {
              OR: evaluationMarkers.map((marker) => ({ notes: { contains: marker } })),
            },
            data: { clientName: params.name },
          })
        : Promise.resolve({ count: 0 }),
    ]);

    return {
      contact,
      updatedClients: updatedClients.count,
      updatedDeals: updatedDeals.count,
      updatedEvaluations: updatedEvaluations.count,
    };
  });
}
