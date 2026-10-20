import type { Prisma } from "@prisma/client";

type NameSyncDatabase = Pick<Prisma.TransactionClient, "salesPipeline" | "client">;

export async function syncEvaluationClientName(database: NameSyncDatabase, params: {
  dealId?: string | null;
  unit: string;
  clientName: string;
}) {
  if (!params.dealId) return;
  const deal = await database.salesPipeline.findUnique({
    where: { id: params.dealId },
    select: { id: true, clientId: true, unit: true },
  });
  if (!deal || deal.unit !== params.unit) return;
  const updated = await database.salesPipeline.updateMany({
    where: { id: deal.id, unit: params.unit },
    data: { clientName: params.clientName },
  });
  if (updated.count && deal.clientId) {
    await database.client.updateMany({
      where: { id: deal.clientId, unit: params.unit },
      data: { name: params.clientName },
    });
  }
}
