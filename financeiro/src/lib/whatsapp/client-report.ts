import { campaignNamesMatch, isGenericCampaignName } from '@/lib/campaign-labels';

export type ReportOrigin = { name: string; url: string | null; description: string };
export type ReportProcedure = { name: string; sessions: number | null; value: number | null; courtesy: boolean };
export type ClientClosing = {
  id: string; clientName: string; closedAt: string | null; origin: ReportOrigin;
  procedures: ReportProcedure[]; total: number | null; warnings: string[]; exportable: boolean;
};
export type ClientReport = {
  conversationId: string; unit: string; contactName: string; generatedAt: string;
  closings: ClientClosing[]; multipleClients: boolean;
};
export type ReportClientRecord = {
  id: string; name: string; campaignName: string | null; fbclid: string | null;
  campaignAttribution: string | null;
};
export type ReportDealRecord = {
  id: string; clientId: string; clientName: string; value: number; closedAt: Date | null;
  campaignNameSnapshot: string | null; campaignAttributionSnapshot: string | null;
  saleItems: { procedureName: string; sessions: number; paidAmount: number; itemType: string }[];
};

export function reportMoney(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    && value <= Number.MAX_SAFE_INTEGER / 100 ? Math.round(value * 100) / 100 : null;
}

export function safeReportUrl(value?: string | null): string | null {
  try {
    const url = new URL(value || '');
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

export function reportOrigin(deal: ReportDealRecord, client?: ReportClientRecord): ReportOrigin {
  const snapshot = deal.campaignNameSnapshot?.trim();
  const current = client?.campaignName?.trim();
  const name = snapshot || current;
  const attribution = deal.campaignAttributionSnapshot || client?.campaignAttribution;
  const conflicting = !!snapshot && !!current && !campaignNamesMatch(snapshot, current);
  const url = conflicting ? null : safeReportUrl(client?.fbclid);
  return {
    name: isGenericCampaignName(name) ? 'Anúncio não identificado' : name!,
    url,
    description: conflicting
      ? 'Campanha registrada no fechamento. O link atual do cadastro não foi associado a esta venda.'
      : attribution === 'manual'
        ? 'Campanha atribuída manualmente no CRM; não comprova o anúncio original.'
        : url ? 'Link do anúncio registrado no cadastro do cliente.'
          : 'Campanha registrada no CRM. O anúncio exato não possui link identificado.',
  };
}

export function buildClientClosing(deal: ReportDealRecord, client?: ReportClientRecord, legacyNames: string[] = []): ClientClosing {
  const warnings: string[] = [];
  const procedures: ReportProcedure[] = deal.saleItems.map(item => ({
    name: item.procedureName.trim() || 'Procedimento sem nome',
    sessions: Number.isInteger(item.sessions) && item.sessions > 0 ? item.sessions : null,
    value: item.itemType === 'courtesy' ? 0 : reportMoney(item.paidAmount),
    courtesy: item.itemType === 'courtesy',
  }));
  if (!procedures.length) {
    procedures.push(...legacyNames.map(name => ({ name, sessions: null, value: null, courtesy: false })));
    warnings.push('Fechamento legado: quantidades e valores por procedimento não estão disponíveis.');
  }
  const total = reportMoney(deal.value);
  let exportable = total !== null;
  if (total === null) warnings.push('O valor final do fechamento não é válido. Revise o cadastro da venda.');
  if (deal.saleItems.length) {
    const sum = procedures.reduce((cents, item) => cents + Math.round((item.value || 0) * 100), 0);
    const invalidItems = procedures.some(item => item.value === null || item.sessions === null)
      || deal.saleItems.some(item => item.itemType === 'courtesy' && item.paidAmount !== 0);
    if (invalidItems || total === null || sum !== Math.round(total * 100)) {
      exportable = false;
      warnings.push('A composição dos procedimentos diverge do valor final registrado. Confira o fechamento no CRM.');
    }
  }
  if (!procedures.length) warnings.push('Os procedimentos deste fechamento não foram registrados.');
  return {
    id: deal.id, clientName: client?.name.trim() || deal.clientName.trim() || 'Nome não cadastrado',
    closedAt: deal.closedAt?.toISOString() || null, origin: reportOrigin(deal, client),
    procedures, total, warnings, exportable,
  };
}

export const reportCurrency = (value: number | null) => value === null
  ? 'Não informado' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
export const reportDate = (value: string | null) => value
  ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short' }).format(new Date(value))
  : 'Data não informada';
