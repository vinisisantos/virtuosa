import type { Prisma } from "@prisma/client";

import { campaignNamesMatch, isGenericCampaignName } from "@/lib/campaign-labels";
import { resolveCampaignAttribution } from "@/lib/lead-attribution";
import { isNotLeadSource } from "@/lib/lead-source";
import {
  classifySaleItem,
  type CampaignOfferView,
  type SaleItemDraft,
} from "@/lib/pipeline/sale-item-types";

type CampaignOfferDatabase = Pick<
  Prisma.TransactionClient,
  "campaign" | "campaignOfferItem" | "client" | "salesPipeline" | "serviceCatalog"
>;

export class CampaignOfferValidationError extends Error {}

export async function normalizeCampaignOfferItems(params: {
  database: CampaignOfferDatabase;
  unit: string;
  submittedItems: unknown;
}) {
  if (params.submittedItems == null) return [];
  if (!Array.isArray(params.submittedItems)) {
    throw new CampaignOfferValidationError("Informe os procedimentos incluídos na campanha.");
  }

  const rawItems = params.submittedItems as Array<Record<string, unknown>>;
  const serviceIds = rawItems
    .map((item) => typeof item.serviceCatalogId === "string" ? item.serviceCatalogId.trim() : "")
    .filter(Boolean);
  if (new Set(serviceIds).size !== serviceIds.length) {
    throw new CampaignOfferValidationError("Um procedimento foi incluído mais de uma vez na campanha.");
  }

  const services = await params.database.serviceCatalog.findMany({
    where: {
      id: { in: serviceIds },
      active: true,
      OR: [{ unit: params.unit }, { unit: "Todas" }],
    },
    select: { id: true, name: true },
  });
  const serviceById = new Map(services.map((service) => [service.id, service]));

  return rawItems.map((rawItem, index) => {
    const serviceCatalogId = typeof rawItem.serviceCatalogId === "string"
      ? rawItem.serviceCatalogId.trim()
      : "";
    const service = serviceById.get(serviceCatalogId);
    if (!service) {
      throw new CampaignOfferValidationError(`Selecione um procedimento válido no item ${index + 1}.`);
    }
    const includedSessions = Number(rawItem.includedSessions);
    if (!Number.isInteger(includedSessions) || includedSessions <= 0 || includedSessions > 999) {
      throw new CampaignOfferValidationError(`Informe uma quantidade válida para ${service.name}.`);
    }
    return {
      serviceCatalogId: service.id,
      procedureName: service.name,
      includedSessions,
    };
  });
}

export async function replaceCampaignOfferItems(
  database: CampaignOfferDatabase,
  campaignId: string,
  items: Array<{ serviceCatalogId: string; procedureName: string; includedSessions: number }>,
) {
  await database.campaignOfferItem.deleteMany({ where: { campaignId } });
  if (items.length === 0) return;
  await database.campaignOfferItem.createMany({
    data: items.map((item) => ({ campaignId, ...item })),
  });
}

export async function resolveCampaignOfferForClient(params: {
  database: CampaignOfferDatabase;
  clientId: string;
  unit: string;
  source?: string | null;
}): Promise<CampaignOfferView | null> {
  if (!params.clientId || isNotLeadSource(params.source)) return null;

  const client = await params.database.client.findUnique({
    where: { id: params.clientId },
    select: {
      campaignName: true,
      campaignAttribution: true,
      source: true,
      campaignId: true,
      fbclid: true,
      utmCampaign: true,
    },
  });
  if (!client?.campaignName || isGenericCampaignName(client.campaignName)) return null;

  const campaigns = await params.database.campaign.findMany({
    where: { OR: [{ unit: params.unit }, { unit: "Todas" }] },
    select: {
      id: true,
      name: true,
      unit: true,
      offerItems: {
        select: {
          serviceCatalogId: true,
          procedureName: true,
          includedSessions: true,
          serviceCatalog: { select: { price: true } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  const matchingCampaign = campaigns
    .filter((campaign) => campaignNamesMatch(campaign.name, client.campaignName))
    .sort((a, b) => Number(b.unit === params.unit) - Number(a.unit === params.unit))[0];
  if (!matchingCampaign) return null;

  return {
    campaignId: matchingCampaign.id,
    campaignName: matchingCampaign.name,
    attribution: resolveCampaignAttribution(client),
    configured: matchingCampaign.offerItems.length > 0,
    items: matchingCampaign.offerItems.map((item) => ({
      serviceCatalogId: item.serviceCatalogId,
      procedureName: item.procedureName,
      includedSessions: item.includedSessions,
      unitPrice: Number(item.serviceCatalog.price || 0),
    })),
  };
}

export async function resolveCampaignOfferForDeal(
  database: CampaignOfferDatabase,
  dealId: string,
) {
  const deal = await database.salesPipeline.findUnique({
    where: { id: dealId },
    select: { clientId: true, unit: true, source: true },
  });
  if (!deal) return null;
  return resolveCampaignOfferForClient({
    database,
    clientId: deal.clientId,
    unit: deal.unit,
    source: deal.source,
  });
}

export function classifySaleItemsForCampaign(
  items: SaleItemDraft[],
  campaignOffer: CampaignOfferView | null,
) {
  const offerByService = new Map(
    (campaignOffer?.items || []).map((item) => [item.serviceCatalogId, item]),
  );
  return items.map((item) => ({
    ...item,
    ...classifySaleItem({
      sessions: item.sessions,
      includedSessions: offerByService.get(item.serviceCatalogId)?.includedSessions,
      hasCampaign: Boolean(campaignOffer),
      campaignConfigured: campaignOffer?.configured,
    }),
  }));
}
