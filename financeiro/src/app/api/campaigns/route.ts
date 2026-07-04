import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getAuthFromRequest } from '@/lib/auth'
import {
  campaignFilterIsUnclassified,
  campaignNamesMatch,
  displayCampaignName,
  isGenericCampaignName,
  normalizeCampaignText,
  UNCLASSIFIED_CAMPAIGN_LABEL,
} from '@/lib/campaign-labels'

function isMetaLeadClient(client: { source: string | null; campaignName: string | null }) {
  return (
    client.source === 'meta_ads' ||
    client.source === 'facebook_ad' ||
    (!!client.campaignName && !isGenericCampaignName(client.campaignName))
  )
}

// GET /api/campaigns — dados agregados diretamente do Client + Campaign
export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthFromRequest(req)
    if (!auth) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const unit           = searchParams.get('unit')     || undefined
    const from           = searchParams.get('from')     || undefined // YYYY-MM-DD
    const to             = searchParams.get('to')       || undefined // YYYY-MM-DD
    const campaignFilter = searchParams.get('campaign') || undefined
    const filterUnclassified = campaignFilterIsUnclassified(campaignFilter)

    // ── Build date boundaries (inclusive, end-of-day for "to") ──────────────
    // new Date('2026-05-28') = midnight UTC — would exclude leads created later
    // that same day. Append T23:59:59 to cover the full calendar day in any TZ.
    const fromDate = from ? new Date(from + 'T00:00:00.000Z') : undefined
    const toDate   = to   ? new Date(to   + 'T23:59:59.999Z') : undefined

    // ── 1. Buscar TODOS os clientes ativos ───────────────────────────────────
    // We fetch without a date filter and do the date comparison in JS so we can
    // use arrivedAt (when set) as the "lead date" instead of createdAt.
    const baseWhere: Record<string, unknown> = { isActive: true }
    if (unit)           baseWhere.unit         = unit

    const allClients = await prisma.client.findMany({
      where: baseWhere,
      select: {
        id: true, name: true, phone: true, email: true,
        source: true, stage: true, totalSpent: true, packageValue: true,
        campaignName: true, unit: true, createdAt: true, arrivedAt: true,
      },
    })

    // ── Helper: effective lead date (arrivedAt if set, else createdAt) ───────
    const leadDate = (c: (typeof allClients)[number]): Date =>
      c.arrivedAt ? new Date(c.arrivedAt) : new Date(c.createdAt)

    // ── 2. Apply date filter in JS ───────────────────────────────────────────
    const campaignMatchesFilter = (c: (typeof allClients)[number]) => {
      if (!campaignFilter) return true
      if (filterUnclassified) return isMetaLeadClient(c) && isGenericCampaignName(c.campaignName)
      return campaignNamesMatch(c.campaignName, campaignFilter)
    }

    const filteredClients = allClients.filter(c => {
      const d = leadDate(c)
      if (fromDate && d < fromDate) return false
      if (toDate   && d > toDate)   return false
      if (!campaignMatchesFilter(c)) return false
      return true
    })

    // ── 3. Leads Meta/CTWA reais ─────────────────────────────────────────────
    const metaClients = filteredClients.filter(isMetaLeadClient)

    // Fetch all campaigns to get their budgets
    const dbCampaigns = await prisma.campaign.findMany({
      where: unit ? { unit } : {},
      select: { name: true, budget: true },
    })
    const budgetMap = new Map<string, number>()
    for (const dc of dbCampaigns) {
      const nameKey = normalizeCampaignText(dc.name)
      budgetMap.set(nameKey, (budgetMap.get(nameKey) || 0) + (dc.budget || 0))
    }

    // ── 4. Agregar por CAMPANHA ───────────────────────────────────────────────
    const campaignMap = new Map<string, {
      campaignName: string
      leads: number; convertidos: number; perdidos: number; emAndamento: number
      receita: number; platform: string; lastLeadAt: string
      budget: number
    }>()

    for (const c of metaClients) {
      const key      = displayCampaignName(c.campaignName)
      const existing = campaignMap.get(key) || {
        campaignName: key, leads: 0, convertidos: 0, perdidos: 0,
        emAndamento: 0, receita: 0,
        platform: c.source || 'meta_ads',
        lastLeadAt: leadDate(c).toISOString(),
        budget: isGenericCampaignName(c.campaignName) ? 0 : budgetMap.get(normalizeCampaignText(key)) || 0,
      }
      existing.leads++
      if      (c.stage === 'venda')     { existing.convertidos++; existing.receita += c.packageValue || c.totalSpent || 0 }
      else if (c.stage === 'nao_venda')   existing.perdidos++
      else                                existing.emAndamento++

      if (leadDate(c) > new Date(existing.lastLeadAt))
        existing.lastLeadAt = leadDate(c).toISOString()

      campaignMap.set(key, existing)
    }

    const registeredCampaignsForTable = campaignFilter
      ? filterUnclassified
        ? []
        : dbCampaigns.filter(dc => campaignNamesMatch(dc.name, campaignFilter))
      : dbCampaigns

    // Ensure registered campaigns without leads are also listed with 0 leads.
    for (const dc of registeredCampaignsForTable) {
      const key = dc.name
      if (!campaignMap.has(key)) {
        campaignMap.set(key, {
          campaignName: key,
          leads: 0,
          convertidos: 0,
          perdidos: 0,
          emAndamento: 0,
          receita: 0,
          platform: 'meta_ads',
          lastLeadAt: new Date(0).toISOString(),
          budget: budgetMap.get(normalizeCampaignText(key)) || 0,
        })
      }
    }

    const campaigns = [...campaignMap.values()].sort((a, b) => b.leads - a.leads)

    // ── 5. Dados por ORIGEM (todos os clientes filtrados) ────────────────────
    const sourceMap = new Map<string, { total: number; vendas: number; receita: number }>()
    for (const c of filteredClients) {
      const src      = c.source || 'desconhecido'
      const existing = sourceMap.get(src) || { total: 0, vendas: 0, receita: 0 }
      existing.total++
      if (c.stage === 'venda') { existing.vendas++; existing.receita += c.packageValue || c.totalSpent || 0 }
      sourceMap.set(src, existing)
    }
    const bySource = [...sourceMap.entries()]
      .map(([source, data]) => ({ source, ...data }))
      .sort((a, b) => b.total - a.total)

    // ── 6. Leads por mês (últimos 6 meses) — usa metaClients NÃO filtrados por data ──
    // Para o gráfico de barras, sempre mostrar os últimos 6 meses completos
    // sem truncar pelo filtro de período
    const metaClientsAll = allClients.filter(isMetaLeadClient)
    const now = new Date()
    const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
    const monthlyMeta = Array.from({ length: 6 }, (_, idx) => {
      const d     = new Date(now.getFullYear(), now.getMonth() - (5 - idx), 1)
      const label = `${monthNames[d.getMonth()]}/${String(d.getFullYear()).slice(-2)}`
      const count = metaClientsAll.filter(c => {
        const dt = leadDate(c)
        return dt.getMonth() === d.getMonth() && dt.getFullYear() === d.getFullYear()
      }).length
      return { label, count, month: d.getMonth(), year: d.getFullYear() }
    })

    // ── 7. Últimos leads recebidos ────────────────────────────────────────────
    const recentLeads = metaClients
      .sort((a, b) => leadDate(b).getTime() - leadDate(a).getTime())
      .slice(0, 50)
      .map(c => ({
        id: c.id, name: c.name, phone: c.phone, email: c.email,
        campaignName: isGenericCampaignName(c.campaignName) ? null : c.campaignName,
        adName: null, formName: null,
        platform: c.source || 'meta_ads', unit: c.unit,
        clientId: c.id, clientStage: c.stage,
        createdAt: c.createdAt.toISOString(),
      }))

    // ── 8. Campanhas ativas (tabela Campaign) ─────────────────────────────────
    const campaignCount = await prisma.campaign.count({
      where: { ...(unit ? { unit } : {}), status: 'ativa' },
    })

    // ── 9. KPIs ───────────────────────────────────────────────────────────────
    const totalMetaLeads   = metaClients.length
    const totalConvertidos = metaClients.filter(c => c.stage === 'venda').length
    const totalReceita     = metaClients.filter(c => c.stage === 'venda')
                               .reduce((s, c) => s + (c.packageValue || c.totalSpent || 0), 0)
    const taxaConversao    = totalMetaLeads > 0
      ? ((totalConvertidos / totalMetaLeads) * 100).toFixed(1) : '0'

    const totalBudget = [...campaignMap.values()].reduce((s, c) => s + (c.budget || 0), 0)
    const overallCpl = totalMetaLeads > 0 ? totalBudget / totalMetaLeads : 0
    const overallCac = totalConvertidos > 0 ? totalBudget / totalConvertidos : 0
    const overallRoas = totalBudget > 0 ? totalReceita / totalBudget : 0

    // ── 10. Lista de campanhas disponíveis (para filtro dropdown) ─────────────
    // Use all active clients (sem filtro de data) para sempre mostrar todas as campanhas
    const allMetaClients = allClients.filter(isMetaLeadClient)
    const realCampaigns = [
      ...new Set(
        allMetaClients
          .map(c => c.campaignName)
          .filter((name): name is string => !!name && !isGenericCampaignName(name))
      ),
    ].sort()
    const availableCampaigns = allMetaClients.some(c => isGenericCampaignName(c.campaignName))
      ? [UNCLASSIFIED_CAMPAIGN_LABEL, ...realCampaigns]
      : realCampaigns

    return NextResponse.json({
      kpis: {
        totalMetaLeads,
        totalConvertidos,
        totalReceita,
        taxaConversao,
        totalCampanhas: campaignCount,
        totalBudget,
        overallCpl,
        overallCac,
        overallRoas,
      },
      campaigns,
      bySource,
      monthlyMeta,
      recentLeads,
      availableCampaigns,
    })
  } catch (error) {
    console.error('[GET /api/campaigns]', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
