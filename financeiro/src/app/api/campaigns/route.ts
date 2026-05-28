import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getAuthFromRequest } from '@/lib/auth'

// GET /api/campaigns — dados agregados diretamente do Client + Campaign
export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthFromRequest(req)
    if (!auth) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const unit = searchParams.get('unit') || undefined
    const from = searchParams.get('from')
    const to   = searchParams.get('to')

    // ── 1. Buscar TODOS os clientes (com filtros) ──
    const clientWhere: Record<string, unknown> = {}
    if (unit) clientWhere.unit = unit
    if (from || to) {
      clientWhere.createdAt = {}
      if (from) (clientWhere.createdAt as Record<string, unknown>).gte = new Date(from)
      if (to)   (clientWhere.createdAt as Record<string, unknown>).lte = new Date(to)
    }

    const allClients = await prisma.client.findMany({
      where: clientWhere,
      select: {
        id: true, name: true, phone: true, email: true,
        source: true, stage: true, totalSpent: true, packageValue: true,
        campaignName: true, unit: true, createdAt: true, arrivedAt: true,
      },
    })

    // ── 2. Agregar por CAMPANHA (clients que têm campaignName) ──
    const campaignMap = new Map<string, {
      campaignName: string
      leads: number
      convertidos: number
      perdidos: number
      emAndamento: number
      receita: number
      platform: string
      lastLeadAt: string
    }>()

    for (const c of allClients) {
      if (!c.campaignName) continue
      const key = c.campaignName
      const existing = campaignMap.get(key) || {
        campaignName: key,
        leads: 0, convertidos: 0, perdidos: 0, emAndamento: 0, receita: 0,
        platform: c.source || 'meta_ads',
        lastLeadAt: c.createdAt.toISOString(),
      }

      existing.leads++
      if (c.stage === 'venda') {
        existing.convertidos++
        existing.receita += c.packageValue || c.totalSpent || 0
      } else if (c.stage === 'nao_venda') {
        existing.perdidos++
      } else {
        existing.emAndamento++
      }

      if (new Date(c.createdAt) > new Date(existing.lastLeadAt)) {
        existing.lastLeadAt = c.createdAt.toISOString()
      }
      campaignMap.set(key, existing)
    }

    const campaigns = [...campaignMap.values()].sort((a, b) => b.leads - a.leads)

    // ── 3. Dados por ORIGEM (todos os clientes) ──
    const sourceMap = new Map<string, { total: number; vendas: number; receita: number }>()
    for (const c of allClients) {
      const src = c.source || 'desconhecido'
      const existing = sourceMap.get(src) || { total: 0, vendas: 0, receita: 0 }
      existing.total++
      if (c.stage === 'venda') {
        existing.vendas++
        existing.receita += c.packageValue || c.totalSpent || 0
      }
      sourceMap.set(src, existing)
    }
    const bySource = [...sourceMap.entries()]
      .map(([source, data]) => ({ source, ...data }))
      .sort((a, b) => b.total - a.total)

    // ── 4. Leads por mês (últimos 6 meses) — usa arrivedAt se tiver, senão createdAt ──
    const metaClients = allClients.filter(c => c.source === 'meta_ads' || c.campaignName)
    const now = new Date()
    const monthlyMeta: { label: string; count: number; month: number; year: number }[] = []
    const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const label = `${monthNames[d.getMonth()]}/${String(d.getFullYear()).slice(-2)}`
      const count = metaClients.filter(c => {
        const dt = c.arrivedAt || c.createdAt
        return dt.getMonth() === d.getMonth() && dt.getFullYear() === d.getFullYear()
      }).length
      monthlyMeta.push({ label, count, month: d.getMonth(), year: d.getFullYear() })
    }

    // ── 5. Últimos leads recebidos (com campaignName ou source=meta_ads) ──
    const recentLeads = metaClients
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 20)
      .map(c => ({
        id: c.id,
        name: c.name,
        phone: c.phone,
        email: c.email,
        campaignName: c.campaignName,
        adName: null,
        formName: null,
        platform: c.source || 'meta_ads',
        unit: c.unit,
        clientId: c.id,
        clientStage: c.stage,
        createdAt: c.createdAt.toISOString(),
      }))

    // ── 6. Campanhas ativas (da tabela Campaign) ──
    const campaignCount = await prisma.campaign.count({
      where: { ...(unit ? { unit } : {}), status: 'ativa' },
    })

    // ── 7. KPIs ──
    const totalMetaLeads = metaClients.length
    const totalConvertidos = metaClients.filter(c => c.stage === 'venda').length
    const totalReceita = metaClients
      .filter(c => c.stage === 'venda')
      .reduce((s, c) => s + (c.packageValue || c.totalSpent || 0), 0)
    const taxaConversao = totalMetaLeads > 0 ? ((totalConvertidos / totalMetaLeads) * 100).toFixed(1) : '0'

    return NextResponse.json({
      kpis: {
        totalMetaLeads,
        totalConvertidos,
        totalReceita,
        taxaConversao,
        totalCampanhas: campaignCount,
      },
      campaigns,
      bySource,
      monthlyMeta,
      recentLeads,
    })
  } catch (error) {
    console.error('[GET /api/campaigns]', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
