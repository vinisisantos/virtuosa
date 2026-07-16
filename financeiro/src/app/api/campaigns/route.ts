import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthFromRequest } from "@/lib/auth";
import {
  campaignNamesMatch,
  isGenericCampaignName,
  normalizeCampaignText,
} from "@/lib/campaign-labels";
import {
  isConfirmedMetaLead,
  isMetaLeadCandidate,
  originBucket,
  resolveCampaignAttribution,
} from "@/lib/lead-attribution";
import { isNotLeadSource } from "@/lib/lead-source";
import { getPipelineProcedureSelections } from "@/lib/pipeline/procedure-audit";
import { getQualifiedWhatsappLeads } from "@/lib/whatsapp/qualified-leads";

const SP_OFFSET = "-03:00";
const ATTRIBUTION_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const MONTH_NAMES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function dateRange(from?: string, to?: string) {
  return {
    start: from ? new Date(`${from}T00:00:00.000${SP_OFFSET}`) : undefined,
    end: to ? new Date(`${to}T23:59:59.999${SP_OFFSET}`) : undefined,
  };
}

function spParts(date: Date) {
  const values = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) => values.find((part) => part.type === type)?.value || "";
  return { year: Number(read("year")), month: Number(read("month")), day: Number(read("day")) };
}

type CampaignRow = {
  campaignName: string;
  leads: number;
  convertidos: number;
  perdidos: number;
  emAndamento: number;
  receita: number;
  receitaRecorrente: number;
  platform: string;
  lastLeadAt: string;
  budget: number;
};

type DemandOrigin = "lead_com_campanha" | "outro_lead" | "nao_lead";

type ProcedureAccumulator = {
  name: string;
  packages: number;
  clients: Set<string>;
  packageRevenue: number;
};

type ClosedDeal = {
  id: string;
  clientId: string;
  clientName: string;
  value: number;
  source: string | null;
  closedAt: Date | null;
  createdAt: Date;
};

type SaleType = "primeira_compra" | "recorrencia" | "venda_direta";

function closedDealTime(deal: ClosedDeal) {
  return deal.closedAt?.getTime() || deal.createdAt.getTime();
}

function isInRange(value: Date, start?: Date, end?: Date) {
  return (!start || value >= start) && (!end || value <= end);
}

function groupClosedDealsByClient(deals: ClosedDeal[]) {
  const grouped = new Map<string, ClosedDeal[]>();
  for (const deal of deals) {
    const current = grouped.get(deal.clientId) || [];
    current.push(deal);
    grouped.set(deal.clientId, current);
  }
  for (const current of grouped.values()) {
    current.sort((a, b) => closedDealTime(a) - closedDealTime(b));
  }
  return grouped;
}

function addProcedure(
  target: Map<string, ProcedureAccumulator>,
  procedureName: string,
  deal: ClosedDeal,
) {
  const key = normalizeCampaignText(procedureName);
  const current = target.get(key) || {
    name: procedureName,
    packages: 0,
    clients: new Set<string>(),
    packageRevenue: 0,
  };
  current.packages += 1;
  current.clients.add(deal.clientId);
  current.packageRevenue += Number(deal.value || 0);
  target.set(key, current);
}

function serializeProcedures(target: Map<string, ProcedureAccumulator>) {
  return [...target.values()]
    .map((procedure) => ({
      name: procedure.name,
      packages: procedure.packages,
      clients: procedure.clients.size,
      packageRevenue: procedure.packageRevenue,
      averagePackageTicket: procedure.packages > 0 ? procedure.packageRevenue / procedure.packages : 0,
    }))
    .sort((a, b) => b.packages - a.packages || b.packageRevenue - a.packageRevenue || a.name.localeCompare(b.name, "pt-BR"));
}

// GET /api/campaigns — visão auditável de origem e campanhas registradas.
export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthFromRequest(req);
    if (!auth) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const unit = searchParams.get("unit") || undefined;
    const from = searchParams.get("from") || undefined;
    const to = searchParams.get("to") || undefined;
    const campaignFilter = searchParams.get("campaign") || undefined;
    const { start, end } = dateRange(from, to);
    const unitWhere = unit ? { OR: [{ unit }, { unit: "Todas" }] } : {};

    const now = spParts(new Date());
    const sixMonthsStart = new Date(`${now.year}-${String(Math.max(1, now.month - 5)).padStart(2, "0")}-01T00:00:00.000${SP_OFFSET}`);
    const nextMonth = now.month === 12 ? { year: now.year + 1, month: 1 } : { year: now.year, month: now.month + 1 };
    const monthlyEnd = new Date(`${nextMonth.year}-${String(nextMonth.month).padStart(2, "0")}-01T00:00:00.000${SP_OFFSET}`);
    const monthlyStart = now.month <= 5
      ? new Date(`${now.year - 1}-${String(now.month + 7).padStart(2, "0")}-01T00:00:00.000${SP_OFFSET}`)
      : sixMonthsStart;

    const monthlyEndInclusive = new Date(monthlyEnd.getTime() - 1);
    const attributionLookbackStart = start
      ? new Date(start.getTime() - ATTRIBUTION_WINDOW_MS)
      : undefined;
    const qualifiedStart = attributionLookbackStart
      ? (attributionLookbackStart < monthlyStart ? attributionLookbackStart : monthlyStart)
      : undefined;
    const qualifiedEnd = end && end > monthlyEndInclusive ? end : monthlyEndInclusive;
    const [qualifiedLeads, registeredCampaigns, closedDeals] = await Promise.all([
      getQualifiedWhatsappLeads({ start: qualifiedStart, end: qualifiedEnd, unit }),
      prisma.campaign.findMany({
        where: unitWhere,
        select: { name: true, budget: true, status: true },
      }),
      prisma.salesPipeline.findMany({
        where: {
          stage: "fechado",
          closedAt: { not: null },
          ...(unit ? { unit } : {}),
        },
        select: {
          id: true,
          clientId: true,
          clientName: true,
          value: true,
          source: true,
          closedAt: true,
          createdAt: true,
        },
        orderBy: [{ closedAt: "asc" }, { createdAt: "asc" }],
      }),
    ]);

    const isInPeriod = (receivedAt: Date) =>
      (!start || receivedAt >= start) && (!end || receivedAt <= end);
    const periodLeads = qualifiedLeads.filter((lead) => isInPeriod(lead.receivedAt));
    const monthlyLeads = qualifiedLeads.filter((lead) =>
      lead.receivedAt >= monthlyStart && lead.receivedAt < monthlyEnd,
    );

    const campaignsByKey = new Map<string, { name: string; budget: number; active: boolean }>();
    for (const campaign of registeredCampaigns) {
      const key = normalizeCampaignText(campaign.name);
      if (!key) continue;
      const current = campaignsByKey.get(key) || { name: campaign.name, budget: 0, active: false };
      current.budget += campaign.budget || 0;
      current.active ||= campaign.status === "ativa";
      campaignsByKey.set(key, current);
    }

    const campaignForClient = (client: (typeof periodLeads)[number]["client"]) => {
      if (isGenericCampaignName(client.campaignName)) return null;
      return campaignsByKey.get(normalizeCampaignText(client.campaignName));
    };
    const matchesFilter = (lead: (typeof periodLeads)[number]) =>
      !campaignFilter || campaignNamesMatch(lead.client.campaignName, campaignFilter);
    const scopedLeads = periodLeads.filter(matchesFilter);
    const confirmedMetaLeads = scopedLeads.filter((lead) => isConfirmedMetaLead(lead.client));
    const pendingMetaLeads = scopedLeads.filter((lead) =>
      isMetaLeadCandidate(lead.client) && !isConfirmedMetaLead(lead.client),
    );
    const manualAttributionLeads = scopedLeads.filter(
      (lead) => resolveCampaignAttribution(lead.client) === "manual",
    );
    const confirmedWithoutRegisteredCampaign = confirmedMetaLeads.filter((lead) => !campaignForClient(lead.client));
    const closedDealsByClient = groupClosedDealsByClient(closedDeals);
    const confirmedLeadsByClient = new Map<string, (typeof confirmedMetaLeads)>();
    for (const lead of confirmedMetaLeads) {
      const current = confirmedLeadsByClient.get(lead.client.id) || [];
      current.push(lead);
      confirmedLeadsByClient.set(lead.client.id, current);
    }
    const acquisitionDealByClient = new Map<string, ClosedDeal>();
    const attributedLeadByClient = new Map<string, (typeof confirmedMetaLeads)[number]>();
    const recurringRevenueByClient = new Map<string, number>();
    for (const [clientId, clientLeads] of confirmedLeadsByClient) {
      const clientDeals = closedDealsByClient.get(clientId) || [];
      const firstDeal = clientDeals[0];
      if (!firstDeal?.closedAt) continue;
      const closedAt = firstDeal.closedAt.getTime();
      const attributedLead = clientLeads
        .filter((lead) => {
          const leadAt = lead.receivedAt.getTime();
          return closedAt >= leadAt && closedAt <= leadAt + ATTRIBUTION_WINDOW_MS;
        })
        .sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime())[0];
      if (!attributedLead) continue;

      acquisitionDealByClient.set(clientId, firstDeal);
      attributedLeadByClient.set(clientId, attributedLead);
      recurringRevenueByClient.set(
        clientId,
        clientDeals.slice(1).reduce((sum, deal) => sum + Number(deal.value || 0), 0),
      );
    }

    const allConfirmedCampaignLeadsByClient = new Map<string, (typeof qualifiedLeads)>();
    for (const lead of qualifiedLeads) {
      if (!isConfirmedMetaLead(lead.client) || !campaignForClient(lead.client)) continue;
      const current = allConfirmedCampaignLeadsByClient.get(lead.client.id) || [];
      current.push(lead);
      allConfirmedCampaignLeadsByClient.set(lead.client.id, current);
    }
    const registeredCampaignClients = new Set<string>();
    for (const [clientId, clientLeads] of allConfirmedCampaignLeadsByClient) {
      const firstDeal = closedDealsByClient.get(clientId)?.[0];
      if (!firstDeal?.closedAt) continue;
      const closedAt = firstDeal.closedAt.getTime();
      if (clientLeads.some((lead) => {
        const leadAt = lead.receivedAt.getTime();
        return closedAt >= leadAt && closedAt <= leadAt + ATTRIBUTION_WINDOW_MS;
      })) {
        registeredCampaignClients.add(clientId);
      }
    }

    const campaignMap = new Map<string, CampaignRow>();
    const campaignLeadClients = new Map<string, Set<string>>();
    const campaignBuyerClients = new Map<string, Set<string>>();
    const campaignAcquisitionDeals = new Map<string, ClosedDeal[]>();
    for (const [key, campaign] of campaignsByKey) {
      if (campaignFilter && !campaignNamesMatch(campaign.name, campaignFilter)) continue;
      campaignMap.set(key, {
        campaignName: campaign.name,
        leads: 0,
        convertidos: 0,
        perdidos: 0,
        emAndamento: 0,
        receita: 0,
        receitaRecorrente: 0,
        platform: "meta_ads",
        lastLeadAt: new Date(0).toISOString(),
        budget: campaign.budget,
      });
    }

    for (const lead of confirmedMetaLeads) {
      const { client } = lead;
      const campaign = campaignForClient(client);
      if (!campaign) continue;
      const row = campaignMap.get(normalizeCampaignText(campaign.name));
      if (!row) continue;

      row.leads += 1;
      const campaignKey = normalizeCampaignText(campaign.name);
      const leadClients = campaignLeadClients.get(campaignKey) || new Set<string>();
      leadClients.add(client.id);
      campaignLeadClients.set(campaignKey, leadClients);
      if (!acquisitionDealByClient.has(client.id) && client.stage === "nao_venda") {
        row.perdidos += 1;
      } else if (!acquisitionDealByClient.has(client.id)) {
        row.emAndamento += 1;
      }
      if (lead.receivedAt > new Date(row.lastLeadAt)) row.lastLeadAt = lead.receivedAt.toISOString();
    }

    for (const [clientId, lead] of attributedLeadByClient) {
      const campaign = campaignForClient(lead.client);
      const deal = acquisitionDealByClient.get(clientId);
      if (!campaign || !deal) continue;
      const row = campaignMap.get(normalizeCampaignText(campaign.name));
      if (!row) continue;
      const campaignKey = normalizeCampaignText(campaign.name);
      row.convertidos += 1;
      row.receita += Number(deal.value || 0);
      row.receitaRecorrente += recurringRevenueByClient.get(clientId) || 0;
      const buyerClients = campaignBuyerClients.get(campaignKey) || new Set<string>();
      buyerClients.add(clientId);
      campaignBuyerClients.set(campaignKey, buyerClients);
      const acquisitionDeals = campaignAcquisitionDeals.get(campaignKey) || [];
      acquisitionDeals.push(deal);
      campaignAcquisitionDeals.set(campaignKey, acquisitionDeals);
    }

    const sourceMap = new Map<string, { total: number; vendas: number; receita: number }>();
    const convertedClientsBySource = new Map<string, Set<string>>();
    for (const lead of scopedLeads) {
      const { client } = lead;
      const key = originBucket(client);
      const current = sourceMap.get(key) || { total: 0, vendas: 0, receita: 0 };
      current.total += 1;
      const countedClients = convertedClientsBySource.get(key) || new Set<string>();
      const acquisitionDeal = acquisitionDealByClient.get(client.id);
      if (acquisitionDeal && !countedClients.has(client.id)) {
        current.vendas += 1;
        current.receita += Number(acquisitionDeal.value || 0);
        countedClients.add(client.id);
      }
      convertedClientsBySource.set(key, countedClients);
      sourceMap.set(key, current);
    }
    const bySource = [...sourceMap.entries()]
      .map(([source, data]) => ({ source, ...data }))
      .sort((a, b) => b.total - a.total);

    const monthKeys = Array.from({ length: 6 }, (_, index) => {
      const absoluteMonth = now.month - 5 + index;
      const year = absoluteMonth <= 0 ? now.year - 1 : now.year;
      const month = absoluteMonth <= 0 ? absoluteMonth + 12 : absoluteMonth;
      return { year, month, key: `${year}-${String(month).padStart(2, "0")}` };
    });
    const monthlyCounts = new Map(monthKeys.map(({ key }) => [key, 0]));
    for (const lead of monthlyLeads) {
      if (!isConfirmedMetaLead(lead.client)) continue;
      const { year, month } = spParts(lead.receivedAt);
      const key = `${year}-${String(month).padStart(2, "0")}`;
      if (monthlyCounts.has(key)) monthlyCounts.set(key, (monthlyCounts.get(key) || 0) + 1);
    }
    const monthlyMeta = monthKeys.map(({ year, month, key }) => ({
      label: `${MONTH_NAMES[month - 1]}/${String(year).slice(-2)}`,
      count: monthlyCounts.get(key) || 0,
    }));

    const recentLeads = [...scopedLeads]
      .filter((lead) => isMetaLeadCandidate(lead.client))
      .sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime())
      .slice(0, 50)
      .map((lead) => {
        const { client } = lead;
        return {
        id: client.id,
        name: client.name,
        phone: client.phone,
        email: client.email,
        campaignName: client.campaignName,
        attribution: resolveCampaignAttribution(client),
        isRegisteredCampaign: !!campaignForClient(client),
        platform: originBucket(client),
        unit: client.unit,
        clientId: client.id,
        clientStage: client.stage,
        leadAt: lead.receivedAt.toISOString(),
      };
      });

    const periodSales = closedDeals.filter((deal) =>
      deal.closedAt ? isInRange(deal.closedAt, start, end) : false,
    );
    const saleTypeFor = (deal: ClosedDeal): SaleType => {
      const firstDeal = closedDealsByClient.get(deal.clientId)?.[0];
      if (firstDeal?.id !== deal.id) return "recorrencia";
      return isNotLeadSource(deal.source) ? "venda_direta" : "primeira_compra";
    };
    const salesByTypeMap = new Map<SaleType, { sales: number; revenue: number }>([
      ["primeira_compra", { sales: 0, revenue: 0 }],
      ["recorrencia", { sales: 0, revenue: 0 }],
      ["venda_direta", { sales: 0, revenue: 0 }],
    ]);
    for (const deal of periodSales) {
      const saleType = saleTypeFor(deal);
      const current = salesByTypeMap.get(saleType)!;
      current.sales += 1;
      current.revenue += Number(deal.value || 0);
    }

    const acquisitionDeals = [...acquisitionDealByClient.values()];
    const procedureSelections = await getPipelineProcedureSelections(prisma, [
      ...periodSales.map((deal) => deal.id),
      ...acquisitionDeals.map((deal) => deal.id),
    ]);
    const procedureMap = new Map<string, ProcedureAccumulator>();
    const procedureMapsByOrigin = new Map<DemandOrigin, Map<string, ProcedureAccumulator>>([
      ["lead_com_campanha", new Map()],
      ["outro_lead", new Map()],
      ["nao_lead", new Map()],
    ]);
    const demandByOriginMap = new Map<DemandOrigin, {
      packages: number;
      clients: Set<string>;
      revenue: number;
    }>([
      ["lead_com_campanha", { packages: 0, clients: new Set(), revenue: 0 }],
      ["outro_lead", { packages: 0, clients: new Set(), revenue: 0 }],
      ["nao_lead", { packages: 0, clients: new Set(), revenue: 0 }],
    ]);
    const combinationMap = new Map<string, { packages: number; revenue: number }>();
    let salesWithoutProcedures = 0;
    for (const deal of periodSales) {
      const demandOrigin: DemandOrigin = isNotLeadSource(deal.source)
        ? "nao_lead"
        : registeredCampaignClients.has(deal.clientId)
          ? "lead_com_campanha"
          : "outro_lead";
      const demandSummary = demandByOriginMap.get(demandOrigin)!;
      demandSummary.packages += 1;
      demandSummary.clients.add(deal.clientId);
      demandSummary.revenue += Number(deal.value || 0);

      const procedureNames = procedureSelections.get(deal.id) || [];
      if (procedureNames.length === 0) {
        salesWithoutProcedures += 1;
        continue;
      }
      const dealValue = Number(deal.value || 0);
      for (const name of procedureNames) {
        addProcedure(procedureMap, name, deal);
        addProcedure(procedureMapsByOrigin.get(demandOrigin)!, name, deal);
      }
      const combination = [...procedureNames].sort((a, b) => a.localeCompare(b, "pt-BR")).join(" + ");
      const currentCombination = combinationMap.get(combination) || { packages: 0, revenue: 0 };
      currentCombination.packages += 1;
      currentCombination.revenue += dealValue;
      combinationMap.set(combination, currentCombination);
    }
    const procedures = serializeProcedures(procedureMap).map((procedure) => {
      const procedureKey = normalizeCampaignText(procedure.name);
      const byOrigin = Object.fromEntries(
        (["lead_com_campanha", "outro_lead", "nao_lead"] as DemandOrigin[]).map((origin) => {
          const current = procedureMapsByOrigin.get(origin)?.get(procedureKey);
          return [origin, {
            packages: current?.packages || 0,
            clients: current?.clients.size || 0,
            packageRevenue: current?.packageRevenue || 0,
          }];
        }),
      );
      return { ...procedure, byOrigin };
    });
    const procedureCombinations = [...combinationMap.entries()]
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.packages - a.packages || b.revenue - a.revenue || a.name.localeCompare(b.name, "pt-BR"));

    const campaignProcedureMaps = new Map<string, Map<string, ProcedureAccumulator>>();
    const campaignSalesWithoutProcedures = new Map<string, number>();
    for (const [campaignKey, deals] of campaignAcquisitionDeals) {
      const procedureMapForCampaign = new Map<string, ProcedureAccumulator>();
      let missingProcedures = 0;
      for (const deal of deals) {
        const procedureNames = procedureSelections.get(deal.id) || [];
        if (procedureNames.length === 0) {
          missingProcedures += 1;
          continue;
        }
        for (const procedureName of procedureNames) {
          addProcedure(procedureMapForCampaign, procedureName, deal);
        }
      }
      campaignProcedureMaps.set(campaignKey, procedureMapForCampaign);
      campaignSalesWithoutProcedures.set(campaignKey, missingProcedures);
    }

    const campaigns = [...campaignMap.entries()]
      .map(([campaignKey, campaign]) => {
        const uniqueClients = campaignLeadClients.get(campaignKey)?.size || 0;
        const buyerClients = campaignBuyerClients.get(campaignKey)?.size || 0;
        const recurringPackages = [...(campaignBuyerClients.get(campaignKey) || [])]
          .reduce((sum, clientId) => sum + Math.max(0, (closedDealsByClient.get(clientId)?.length || 0) - 1), 0);
        return {
          ...campaign,
          uniqueClients,
          buyerClients,
          conversionRate: uniqueClients > 0 ? (buyerClients / uniqueClients) * 100 : 0,
          acquisitionPackages: campaignAcquisitionDeals.get(campaignKey)?.length || 0,
          recurringPackages,
          salesWithoutProcedures: campaignSalesWithoutProcedures.get(campaignKey) || 0,
          procedures: serializeProcedures(campaignProcedureMaps.get(campaignKey) || new Map()),
        };
      })
      .sort((a, b) => b.leads - a.leads || a.campaignName.localeCompare(b.campaignName, "pt-BR"));

    const demandByOrigin = (["lead_com_campanha", "outro_lead", "nao_lead"] as DemandOrigin[])
      .map((origin) => {
        const current = demandByOriginMap.get(origin)!;
        return {
          origin,
          packages: current.packages,
          clients: current.clients.size,
          revenue: current.revenue,
        };
      });

    const salesRevenue = periodSales.reduce((sum, deal) => sum + Number(deal.value || 0), 0);
    const salesSummary = {
      totalSales: periodSales.length,
      uniqueClients: new Set(periodSales.map((deal) => deal.clientId)).size,
      totalRevenue: salesRevenue,
      averageTicket: periodSales.length > 0 ? salesRevenue / periodSales.length : 0,
      incompleteValueSales: periodSales.filter((deal) => Number(deal.value || 0) <= 0).length,
      salesWithoutProcedures,
    };
    const salesByType = [...salesByTypeMap.entries()].map(([type, data]) => ({ type, ...data }));

    const totalBudget = campaigns.reduce((sum, campaign) => sum + campaign.budget, 0);
    const totalConvertidos = acquisitionDealByClient.size;
    const totalReceita = [...acquisitionDealByClient.values()]
      .reduce((sum, deal) => sum + Number(deal.value || 0), 0);
    const totalReceitaRecorrente = [...recurringRevenueByClient.values()]
      .reduce((sum, revenue) => sum + revenue, 0);

    return NextResponse.json({
      kpis: {
        totalLeads: scopedLeads.length,
        totalMetaLeads: confirmedMetaLeads.length,
        pendingMetaLeads: pendingMetaLeads.length,
        manualAttributionLeads: manualAttributionLeads.length,
        unassignedConfirmedMetaLeads: confirmedWithoutRegisteredCampaign.length,
        totalConvertidos,
        totalReceita,
        totalReceitaRecorrente,
        totalReceitaLifetime: totalReceita + totalReceitaRecorrente,
        taxaConversao: confirmedMetaLeads.length > 0
          ? ((totalConvertidos / confirmedMetaLeads.length) * 100).toFixed(1)
          : "0",
        totalCampanhas: [...campaignsByKey.values()].filter((campaign) => campaign.active).length,
        totalBudget,
        overallCpl: confirmedMetaLeads.length > 0 ? totalBudget / confirmedMetaLeads.length : 0,
        overallCac: totalConvertidos > 0 ? totalBudget / totalConvertidos : 0,
        overallRoas: totalBudget > 0 ? totalReceita / totalBudget : 0,
      },
      campaigns,
      bySource,
      monthlyMeta,
      recentLeads,
      salesSummary,
      salesByType,
      procedures,
      procedureCombinations,
      demandByOrigin,
      availableCampaigns: [...campaignsByKey.values()].map((campaign) => campaign.name).sort((a, b) => a.localeCompare(b, "pt-BR")),
      criteria: {
        leadDate: "Mensagem inicial qualificada no WhatsApp, deduplicada por telefone e dia",
        confirmedMeta: "Mensagem qualificada com atribuição automática via Meta/CTWA",
        campaignPerformance: "Somente campanhas cadastradas e mensagens Meta confirmadas",
        historical: "Registros antigos sem evidência rastreável permanecem em Meta a validar",
        attributionWindow: "Primeira compra do cliente realizada em até 30 dias após a entrada do lead",
        recurringRevenue: "Compras posteriores do mesmo cliente aparecem como recorrência/LTV e não aumentam o ROAS de aquisição",
      },
    }, {
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" },
    });
  } catch (error) {
    console.error("[GET /api/campaigns]", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
