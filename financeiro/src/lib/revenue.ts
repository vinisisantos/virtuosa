export interface RevenueRecord {
  type: string;
  source?: string;
  status?: string;
}

export const isManualRevenue = (entry: RevenueRecord) =>
  entry.type === 'sale' && entry.source === 'manual';

export const isOperationalSale = (entry: RevenueRecord) =>
  entry.type === 'sale' && !isManualRevenue(entry);

export const isRevenueReceived = (entry: RevenueRecord) =>
  entry.type === 'sale' && (!isManualRevenue(entry) || entry.status === 'received');

export const isRevenuePending = (entry: RevenueRecord) =>
  isManualRevenue(entry) && entry.status !== 'received';
