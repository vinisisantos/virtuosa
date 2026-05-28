import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getAuthFromRequest } from '@/lib/auth'

// GET /api/campaigns — dados agregados de desempenho de campanhas
export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthFromRequest(req)
    if (!auth) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const unit = searchParams.get('unit') || undefined
    const from = searchParams.get('from')  // ISO date
    const to   = searchParams.get('to')    // ISO date

    // ── 1. Buscar MetaLeads agrupados por campanha ──────────────────────────

    const leadWhere: Record<string, unknown> = { status: 'processado' }
    if (unit) leadWhere.unit = unit
    if (from || to) {
      leadWhere.createdAt = {}
      if (from) (leadWhere.createdAt as Record<string, unknown>).gte = new Date(from)
      if (to)   (leadWhere.createdAt as Record<string, unknown>).lte = new Date(to)
    }

    const metaLeads = await prisma.metaLead.findMany({
      where: leadWhere,
      select: {
        id: true, campaignId: true, campaignName: true,
        adId: true, adName: true, formName: true,
        name: true, phone: true, email: true,
        platform: true, clientId: true, unit: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    })

    // ── 2. Buscar clientes vinculados para ver stage/totalSpent ─────────────

    const clientIds = [...new Set(metaLeads.map(l => l.clientId).filter(Boolean) as string[])]

    const clients = clientIds.length > 0
      ? await prisma.client.findMany({
          where: { id: { in: clientIds } },
          select: { id: true, stage: true, totalSpent: true, source: true, name: true },
        })
      : []

    const clientMap = new Map(clients.map(c => [c.id, c]))

    // ── 3. Agregar por campanha ─────────────────────────────────────────────

    const campaignMap = new Map<string, {
      campaignId: string | null
      campaignName: string
      leads: number
      convertidos: number
      perdidos: number
      emAndamento: number
      receita: number
      platform: string
      lastLeadAt: string
    }>()

    for (const lead of metaLeads) {
      const key = lead.campaignName || lead.campaignId || 'Sem campanha'
      const existing = campaignMap.get(key) || {
        campaignId: lead.campaignId,
        campaignName: key,
        leads: 0,
        convertidos: 0,
        perdidos: 0,
        emAndamento: 0,
        receita: 0,
        platform: lead.platform,
        lastLeadAt: lead.createdAt.toISOString(),
      }

      existing.leads++

      if (lead.clientId) {
        const client = clientMap.get(lead.clientId)
        if (client) {
          if (client.stage === 'venda') {
            existing.convertidos++
            existing.receita += client.totalSpent || 0
          } else if (client.stage === 'nao_venda') {
            existing.perdidos++
          } else {
            existing.emAndamento++
          }
        }
      }

      if (new Date(lead.createdAt) > new Date(existing.lastLeadAt)) {
        existing.lastLeadAt = lead.createdAt.toISOString()
      }

      campaignMap.set(key, existing)
    }

    const campaigns = [...campaignMap.values()]
      .sort((a, b) => b.leads - a.leads)

    // ── 4. Dados por origem (todos os clientes, não só Meta) ────────────────

    const clientWhere: Record<string, unknown> = {}
    if (unit) clientWhere.unit = unit
    if (from || to) {
      clientWhere.createdAt = {}
      if (from) (clientWhere.createdAt as Record<string, unknown>).gte = new Date(from)
      if (to)   (clientWhere.createdAt as Record<string, unknown>).lte = new Date(to)
    }

    const allClients = await prisma.client.findMany({
      where: clientWhere,
      select: { source: true, stage: true, totalSpent: true, createdAt: true },
    })

    const sourceMap = new Map<string, { total: number; vendas: number; receita: number }>()
    for (const c of allClients) {
      const src = c.source || 'desconhecido'
      const existing = sourceMap.get(src) || { total: 0, vendas: 0, receita: 0 }
      existing.total++
      if (c.stage === 'venda') {
        existing.vendas++
        existing.receita += c.totalSpent || 0
      }
      sourceMap.set(src, existing)
    }

    const bySource = [...sourceMap.entries()]
      .map(([source, data]) => ({ source, ...data }))
      .sort((a, b) => b.total - a.total)

    // ── 5. Leads por mês (últimos 6 meses) ──────────────────────────────────

    const now = new Date()
    const monthlyMeta: { label: string; count: number; month: number; year: number }[] = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const label = d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })
      const count = metaLeads.filter(l => {
        const ld = new Date(l.createdAt)
        return ld.getMonth() === d.getMonth() && ld.getFullYear() === d.getFullYear()
      }).length
      monthlyMeta.push({ label, count, month: d.getMonth(), year: d.getFullYear() })
    }

    // ── 6. Últimos leads recebidos ──────────────────────────────────────────

    const recentLeads = metaLeads.slice(0, 20).map(l => ({
      id: l.id,
      name: l.name,
      phone: l.phone,
      email: l.email,
      campaignName: l.campaignName,
      adName: l.adName,
      formName: l.formName,
      platform: l.platform,
      unit: l.unit,
      clientId: l.clientId,
      clientStage: l.clientId ? clientMap.get(l.clientId)?.stage : null,
      createdAt: l.createdAt.toISOString(),
    }))

    // ── 7. KPIs gerais ──────────────────────────────────────────────────────

    const totalMetaLeads = metaLeads.length
    const totalConvertidos = campaigns.reduce((s, c) => s + c.convertidos, 0)
    const totalReceita = campaigns.reduce((s, c) => s + c.receita, 0)
    const taxaConversao = totalMetaLeads > 0 ? ((totalConvertidos / totalMetaLeads) * 100).toFixed(1) : '0'

    return NextResponse.json({
      kpis: {
        totalMetaLeads,
        totalConvertidos,
        totalReceita,
        taxaConversao,
        totalCampanhas: campaigns.length,
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
