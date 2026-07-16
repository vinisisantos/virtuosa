export type SaleItemType = "paid" | "courtesy";
export type SaleItemClassification = "direct" | "included" | "additional" | "mixed" | "unclassified";

export type CampaignOfferItemView = {
  serviceCatalogId: string;
  procedureName: string;
  includedSessions: number;
  unitPrice: number;
};

export type CampaignOfferView = {
  campaignId: string;
  campaignName: string;
  attribution: string | null;
  configured: boolean;
  items: CampaignOfferItemView[];
};

export type SaleItemDraft = {
  serviceCatalogId: string;
  procedureName: string;
  sessions: number;
  unitPrice: number;
  paidAmount: number;
  itemType: SaleItemType;
  classification?: SaleItemClassification;
  campaignIncludedSessions?: number;
};

export type PipelineSaleItemView = SaleItemDraft & {
  id?: string;
  subtotal: number;
  discountAmount: number;
  discountPercent: number;
  classification: SaleItemClassification;
  campaignIncludedSessions: number;
  additionalSessions: number;
};

export function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function saleItemSubtotal(item: Pick<SaleItemDraft, "unitPrice" | "sessions">) {
  return roundMoney(Number(item.unitPrice || 0) * Number(item.sessions || 0));
}

export function saleItemPaidAmount(item: Pick<SaleItemDraft, "paidAmount" | "itemType">) {
  return item.itemType === "courtesy" ? 0 : roundMoney(Number(item.paidAmount || 0));
}

export function saleItemDiscount(item: SaleItemDraft) {
  return roundMoney(Math.max(0, saleItemSubtotal(item) - saleItemPaidAmount(item)));
}

export function saleItemsTotal(items: SaleItemDraft[]) {
  return roundMoney(items.reduce((sum, item) => sum + saleItemPaidAmount(item), 0));
}

export function saleItemDraftsFromView(items?: PipelineSaleItemView[] | null): SaleItemDraft[] {
  return (items || []).map((item) => ({
    serviceCatalogId: item.serviceCatalogId,
    procedureName: item.procedureName,
    sessions: item.sessions,
    unitPrice: item.unitPrice,
    paidAmount: item.itemType === "courtesy" ? 0 : item.paidAmount,
    itemType: item.itemType,
    classification: item.classification,
    campaignIncludedSessions: item.campaignIncludedSessions,
  }));
}

export function saleItemDraftsFromCampaignOffer(offer?: CampaignOfferView | null): SaleItemDraft[] {
  if (!offer?.configured) return [];
  return offer.items.map((item) => ({
    serviceCatalogId: item.serviceCatalogId,
    procedureName: item.procedureName,
    sessions: item.includedSessions,
    unitPrice: roundMoney(item.unitPrice),
    paidAmount: roundMoney(item.unitPrice * item.includedSessions),
    itemType: "paid",
    classification: "included",
    campaignIncludedSessions: item.includedSessions,
  }));
}

export function classifySaleItem(params: {
  sessions: number;
  includedSessions?: number;
  hasCampaign: boolean;
  campaignConfigured?: boolean;
}): Pick<SaleItemDraft, "classification" | "campaignIncludedSessions"> {
  if (!params.hasCampaign) {
    return { classification: "direct", campaignIncludedSessions: 0 };
  }
  if (!params.campaignConfigured) {
    return { classification: "unclassified", campaignIncludedSessions: 0 };
  }
  const campaignIncludedSessions = Math.max(
    0,
    Math.min(params.sessions, Number(params.includedSessions || 0)),
  );
  if (campaignIncludedSessions === 0) {
    return { classification: "additional", campaignIncludedSessions: 0 };
  }
  return {
    classification: campaignIncludedSessions >= params.sessions ? "included" : "mixed",
    campaignIncludedSessions,
  };
}
