import type { Prisma } from "@prisma/client";

import {
  roundMoney,
  saleItemDiscount,
  saleItemPaidAmount,
  saleItemSubtotal,
  saleItemsTotal,
  type PipelineSaleItemView,
  type SaleItemDraft,
  type SaleItemType,
} from "@/lib/pipeline/sale-item-types";

type SaleItemDatabase = Pick<Prisma.TransactionClient, "serviceCatalog" | "pipelineSaleItem">;

export class SaleItemValidationError extends Error {}

function parseItemType(value: unknown): SaleItemType {
  return value === "courtesy" ? "courtesy" : "paid";
}

export async function normalizeSubmittedSaleItems(params: {
  database: SaleItemDatabase;
  unit: string;
  submittedItems: unknown;
}) {
  if (!Array.isArray(params.submittedItems)) {
    throw new SaleItemValidationError("Informe os procedimentos do fechamento.");
  }

  const rawItems = params.submittedItems as Array<Record<string, unknown>>;
  if (rawItems.length === 0) {
    throw new SaleItemValidationError("Informe ao menos um procedimento do fechamento.");
  }

  const serviceIds = [...new Set(
    rawItems
      .map((item) => typeof item.serviceCatalogId === "string" ? item.serviceCatalogId.trim() : "")
      .filter(Boolean),
  )];
  const services = await params.database.serviceCatalog.findMany({
    where: {
      id: { in: serviceIds },
      active: true,
      OR: [{ unit: params.unit }, { unit: "Todas" }],
    },
    select: { id: true, name: true, price: true },
  });
  const serviceById = new Map(services.map((service) => [service.id, service]));

  const items: SaleItemDraft[] = rawItems.map((rawItem, index) => {
    const serviceId = typeof rawItem.serviceCatalogId === "string" ? rawItem.serviceCatalogId.trim() : "";
    const service = serviceById.get(serviceId);
    if (!service) {
      throw new SaleItemValidationError(`Selecione um procedimento cadastrado no item ${index + 1}.`);
    }

    const sessions = Number(rawItem.sessions);
    if (!Number.isInteger(sessions) || sessions <= 0 || sessions > 999) {
      throw new SaleItemValidationError(`Informe uma quantidade de sessões válida para ${service.name}.`);
    }

    const itemType = parseItemType(rawItem.itemType);
    const paidAmount = itemType === "courtesy" ? 0 : roundMoney(Number(rawItem.paidAmount));
    if (!Number.isFinite(paidAmount) || paidAmount < 0) {
      throw new SaleItemValidationError(`Informe um valor pago válido para ${service.name}.`);
    }

    const normalizedItem: SaleItemDraft = {
      serviceCatalogId: service.id,
      procedureName: service.name,
      sessions,
      unitPrice: roundMoney(service.price),
      paidAmount,
      itemType,
    };
    if (saleItemPaidAmount(normalizedItem) > saleItemSubtotal(normalizedItem)) {
      throw new SaleItemValidationError(`O valor pago de ${service.name} não pode superar o subtotal de tabela.`);
    }
    return normalizedItem;
  });

  const duplicateService = items.find((item, index) =>
    items.findIndex((candidate) => candidate.serviceCatalogId === item.serviceCatalogId) !== index,
  );
  if (duplicateService) {
    throw new SaleItemValidationError(`${duplicateService.procedureName} foi adicionado mais de uma vez.`);
  }

  return {
    items,
    procedureNames: items.map((item) => item.procedureName),
    totalValue: saleItemsTotal(items),
  };
}

export async function replacePipelineSaleItems(
  database: SaleItemDatabase,
  pipelineDealId: string,
  items: SaleItemDraft[],
) {
  await database.pipelineSaleItem.deleteMany({ where: { pipelineDealId } });
  if (items.length === 0) return;

  await database.pipelineSaleItem.createMany({
    data: items.map((item) => ({
      pipelineDealId,
      serviceCatalogId: item.serviceCatalogId,
      procedureName: item.procedureName,
      sessions: item.sessions,
      unitPrice: item.unitPrice,
      subtotal: saleItemSubtotal(item),
      paidAmount: saleItemPaidAmount(item),
      discountAmount: saleItemDiscount(item),
      itemType: item.itemType,
    })),
  });
}

export async function getPipelineSaleItems(
  database: SaleItemDatabase,
  dealIds: string[],
) {
  const uniqueDealIds = [...new Set(dealIds.filter(Boolean))];
  const byDealId = new Map<string, PipelineSaleItemView[]>();
  if (uniqueDealIds.length === 0) return byDealId;

  const items = await database.pipelineSaleItem.findMany({
    where: { pipelineDealId: { in: uniqueDealIds } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  for (const item of items) {
    const subtotal = roundMoney(item.subtotal);
    const discountAmount = roundMoney(item.discountAmount);
    const current = byDealId.get(item.pipelineDealId) || [];
    current.push({
      id: item.id,
      serviceCatalogId: item.serviceCatalogId || "",
      procedureName: item.procedureName,
      sessions: item.sessions,
      unitPrice: roundMoney(item.unitPrice),
      subtotal,
      paidAmount: roundMoney(item.paidAmount),
      discountAmount,
      discountPercent: subtotal > 0 ? roundMoney((discountAmount / subtotal) * 100) : 0,
      itemType: item.itemType === "courtesy" ? "courtesy" : "paid",
    });
    byDealId.set(item.pipelineDealId, current);
  }

  return byDealId;
}
