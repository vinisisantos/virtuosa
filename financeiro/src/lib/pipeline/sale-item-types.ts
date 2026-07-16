export type SaleItemType = "paid" | "courtesy";

export type SaleItemDraft = {
  serviceCatalogId: string;
  procedureName: string;
  sessions: number;
  unitPrice: number;
  paidAmount: number;
  itemType: SaleItemType;
};

export type PipelineSaleItemView = SaleItemDraft & {
  id?: string;
  subtotal: number;
  discountAmount: number;
  discountPercent: number;
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
  }));
}
