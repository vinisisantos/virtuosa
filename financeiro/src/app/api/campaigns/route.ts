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
import { getQualifiedWhatsappLeads } from "@/lib/whatsapp/qualified-leads";

const SP_OFFSET = "-03:00";
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
  platform: string;
  lastLeadAt: string;
  budget: number;
};

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
    const qualifiedStart = start ? (start < monthlyStart ? start : monthlyStart) : undefined;
    const qualifiedEnd = end && end > monthlyEndInclusive ? end : monthlyEndInclusive;
    const [qualifiedLeads, registeredCampaigns] = await Promise.all([
      getQualifiedWhatsappLeads({ start: qualifiedStart, end: qualifiedEnd, unit }),
      prisma.campaign.findMany({
        where: unitWhere,
        select: { name: true, budget: true, status: true },
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

    const campaignMap = new Map<string, CampaignRow>();
    for (const [key, campaign] of campaignsByKey) {
      if (campaignFilter && !campaignNamesMatch(campaign.name, campaignFilter)) continue;
      campaignMap.set(key, {
        campaignName: campaign.name,
        leads: 0,
        convertidos: 0,
        perdidos: 0,
        emAndamento: 0,
        receita: 0,
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
      if (client.stage === "venda") {
        row.convertidos += 1;
        row.receita += client.packageValue || client.totalSpent || 0;
      } else if (client.stage === "nao_venda") {
        row.perdidos += 1;
      } else {
        row.emAndamento += 1;
      }
      if (lead.receivedAt > new Date(row.lastLeadAt)) row.lastLeadAt = lead.receivedAt.toISOString();
    }
    const campaigns = [...campaignMap.values()].sort((a, b) => b.leads - a.leads || a.campaignName.localeCompare(b.campaignName, "pt-BR"));

    const sourceMap = new Map<string, { total: number; vendas: number; receita: number }>();
    for (const lead of scopedLeads) {
      const { client } = lead;
      const key = originBucket(client);
      const current = sourceMap.get(key) || { total: 0, vendas: 0, receita: 0 };
      current.total += 1;
      if (client.stage === "venda") {
        current.vendas += 1;
        current.receita += client.packageValue || client.totalSpent || 0;
      }
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

    const totalBudget = campaigns.reduce((sum, campaign) => sum + campaign.budget, 0);
    const totalConvertidos = confirmedMetaLeads.filter((lead) => lead.client.stage === "venda").length;
    const totalReceita = confirmedMetaLeads
      .filter((lead) => lead.client.stage === "venda")
      .reduce((sum, lead) => sum + (lead.client.packageValue || lead.client.totalSpent || 0), 0);

    return NextResponse.json({
      kpis: {
        totalLeads: scopedLeads.length,
        totalMetaLeads: confirmedMetaLeads.length,
        pendingMetaLeads: pendingMetaLeads.length,
        manualAttributionLeads: manualAttributionLeads.length,
        unassignedConfirmedMetaLeads: confirmedWithoutRegisteredCampaign.length,
        totalConvertidos,
        totalReceita,
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
      availableCampaigns: [...campaignsByKey.values()].map((campaign) => campaign.name).sort((a, b) => a.localeCompare(b, "pt-BR")),
      criteria: {
        leadDate: "Mensagem inicial qualificada no WhatsApp, deduplicada por telefone e dia",
        confirmedMeta: "Mensagem qualificada com atribuição automática via Meta/CTWA",
        campaignPerformance: "Somente campanhas cadastradas e mensagens Meta confirmadas",
        historical: "Registros antigos sem evidência rastreável permanecem em Meta a validar",
      },
    }, {
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" },
    });
  } catch (error) {
    console.error("[GET /api/campaigns]", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
