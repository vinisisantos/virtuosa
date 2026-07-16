'use client'

import { Fragment, useState, useEffect, useCallback } from 'react'
import { useGlobalUnit } from '@/contexts/UnitContext'
import AuthGuard from '@/components/auth-guard'
import { DatePicker } from '@/components/ui/date-picker'
import { isGenericCampaignName } from '@/lib/campaign-labels'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Campaign {
  campaignId:   string | null
  campaignName: string
  leads:        number
  convertidos:  number
  perdidos:     number
  emAndamento:  number
  receita:      number
  receitaRecorrente: number
  platform:     string
  lastLeadAt:   string
  budget:       number
  uniqueClients: number
  buyerClients: number
  conversionRate: number
  acquisitionPackages: number
  recurringPackages: number
  salesWithoutProcedures: number
  procedures: CampaignProcedurePerformance[]
}

interface SourceData {
  source:  string
  total:   number
  vendas:  number
  receita: number
}

interface MonthlyData {
  label: string
  count: number
}

interface RecentLead {
  id:           string
  name:         string | null
  phone:        string | null
  email:        string | null
  campaignName: string | null
  attribution:  'automatic_meta' | 'automatic_utm' | 'manual' | 'historical_unverified' | null
  isRegisteredCampaign: boolean
  platform:     string
  unit:         string | null
  clientId:     string | null
  clientStage:  string | null
  leadAt:       string
}

interface KPIs {
  totalLeads:       number
  totalMetaLeads:   number
  pendingMetaLeads: number
  manualAttributionLeads: number
  unassignedConfirmedMetaLeads: number
  totalConvertidos: number
  totalReceita:     number
  taxaConversao:    string
  totalCampanhas:   number
  totalBudget:      number
  overallCpl:       number
  overallCac:       number
  overallRoas:      number
  totalReceitaRecorrente: number
  totalReceitaLifetime: number
}

interface SalesSummary {
  totalSales: number
  uniqueClients: number
  totalRevenue: number
  averageTicket: number
  incompleteValueSales: number
  salesWithoutProcedures: number
}

interface SalesByType {
  type: 'primeira_compra' | 'recorrencia' | 'venda_direta'
  sales: number
  revenue: number
}

interface ProcedurePerformance {
  name: string
  packages: number
  clients: number
  packageRevenue: number
  averagePackageTicket: number
  byOrigin: Record<DemandOrigin, ProcedureOriginPerformance>
}

type CampaignProcedurePerformance = Omit<ProcedurePerformance, 'byOrigin'>

type DemandOrigin = 'lead_com_campanha' | 'outro_lead' | 'nao_lead'

interface ProcedureOriginPerformance {
  packages: number
  clients: number
  packageRevenue: number
}

interface DemandByOrigin {
  origin: DemandOrigin
  packages: number
  clients: number
  revenue: number
}

interface ProcedureCombination {
  name: string
  packages: number
  revenue: number
}

interface DetailedOriginPerformance {
  packages: number
  clients: number
  sessions: number
  paidRevenue: number
}

interface DetailedProcedurePerformance {
  name: string
  packages: number
  clients: number
  sessions: number
  paidRevenue: number
  subtotal: number
  discount: number
  courtesySessions: number
  includedSessions: number
  additionalSessions: number
  unclassifiedSessions: number
  byOrigin: Record<DemandOrigin, DetailedOriginPerformance>
}

interface DetailedSales {
  coverage: {
    detailedDeals: number
    legacyDeals: number
    items: number
    sessions: number
    paidRevenue: number
    subtotal: number
    discount: number
    courtesyItems: number
    courtesySessions: number
  }
  byOrigin: Array<DetailedOriginPerformance & { origin: DemandOrigin }>
  procedures: DetailedProcedurePerformance[]
  campaignUpsell: Array<{
    campaignName: string
    packages: number
    packagesWithAdditional: number
    additionalAttachRate: number
    includedSessions: number
    additionalSessions: number
    includedPaidRevenue: number
    additionalPaidRevenue: number
    mixedPaidRevenue: number
    courtesySessions: number
  }>
  packages: Array<{
    dealId: string
    clientName: string
    origin: DemandOrigin
    campaignName: string | null
    totalValue: number
    sessions: number
    paidRevenue: number
    procedures: Array<{
      name: string
      sessions: number
      paidAmount: number
      itemType: string
      classification: string
      includedSessions: number
      additionalSessions: number
    }>
  }>
}

interface CampaignData {
  kpis:        KPIs
  campaigns:   Campaign[]
  bySource:    SourceData[]
  monthlyMeta: MonthlyData[]
  recentLeads: RecentLead[]
  salesSummary: SalesSummary
  salesByType: SalesByType[]
  procedures: ProcedurePerformance[]
  procedureCombinations: ProcedureCombination[]
  demandByOrigin: DemandByOrigin[]
  detailedSales: DetailedSales
  availableCampaigns: string[]
  criteria: {
    leadDate: string
    confirmedMeta: string
    campaignPerformance: string
    historical: string
    attributionWindow: string
    recurringRevenue: string
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

function todayDateInput() {
  const date = new Date()
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const SOURCE_LABELS: Record<string, { label: string; color: string; icon: string }> = {
  meta_ads:     { label: 'Meta Ads',     color: '#0668E1', icon: 'ads_click' },
  meta_ads_pendente: { label: 'Meta Ads a validar', color: '#f59e0b', icon: 'pending' },
  atribuicao_manual: { label: 'Atribuição manual', color: '#8b5cf6', icon: 'edit_note' },
  instagram:    { label: 'Instagram',    color: '#E1306C', icon: 'photo_camera' },
  whatsapp:     { label: 'WhatsApp',     color: '#25D366', icon: 'chat' },
  indicacao:    { label: 'Indicação',    color: '#8b5cf6', icon: 'group_add' },
  google:       { label: 'Google',       color: '#4285F4', icon: 'search' },
  site:         { label: 'Site',         color: '#14b8a6', icon: 'language' },
  outro:        { label: 'Outro',        color: '#94a3b8', icon: 'public' },
  desconhecido: { label: 'Desconhecido', color: '#64748b', icon: 'help' },
}

const STAGE_LABELS: Record<string, { label: string; color: string }> = {
  entrada:      { label: 'Entrada',       color: '#6366f1' },
  em_andamento: { label: 'Em Andamento',  color: '#f59e0b' },
  avaliacao:    { label: 'Avaliação',     color: '#8b5cf6' },
  venda:        { label: 'Convertido',    color: '#10b981' },
  nao_venda:    { label: 'Perdido',       color: '#ef4444' },
}

const ATTRIBUTION_LABELS: Record<NonNullable<RecentLead['attribution']>, { label: string; color: string }> = {
  automatic_meta: { label: 'Meta confirmado', color: '#0668E1' },
  automatic_utm: { label: 'UTM confirmado', color: '#14b8a6' },
  manual: { label: 'Atribuição manual', color: '#8b5cf6' },
  historical_unverified: { label: 'A validar', color: '#f59e0b' },
}

const SALE_TYPE_LABELS: Record<SalesByType['type'], { label: string; color: string; icon: string }> = {
  primeira_compra: { label: 'Primeira compra via lead', color: '#10b981', icon: 'person_add' },
  recorrencia: { label: 'Recorrência inferida', color: '#8b5cf6', icon: 'autorenew' },
  venda_direta: { label: 'Venda direta da clínica', color: '#f59e0b', icon: 'storefront' },
}

const DEMAND_ORIGIN_LABELS: Record<DemandOrigin, { label: string; description: string; color: string; icon: string }> = {
  lead_com_campanha: { label: 'Lead com campanha', description: 'Compra atribuída a uma campanha registrada', color: '#0668E1', icon: 'campaign' },
  outro_lead: { label: 'Outros leads', description: 'Lead sem campanha registrada ou de outra origem', color: '#8b5cf6', icon: 'person_search' },
  nao_lead: { label: 'Não é lead', description: 'Venda direta, renovação ou cliente da clínica', color: '#f59e0b', icon: 'storefront' },
}

// ─── Card base ────────────────────────────────────────────────────────────────

// ─── Card base ────────────────────────────────────────────────────────────────

const cardS: React.CSSProperties = {
  background: 'rgba(var(--card), 0.6)', borderRadius: 16, border: '1px solid rgba(var(--border), 0.5)',
  boxShadow: '0 1px 2px rgba(0,0,0,0.05)', padding: '20px', backdropFilter: 'blur(10px)'
}

// ─── Seletor inline de campanha (classificação manual de leads) ────────────────

const isGenericCampaign = (n: string | null) => isGenericCampaignName(n)

function LeadCampaignSelect({
  lead,
  options,
  onSaved,
}: {
  lead: RecentLead
  options: string[]
  onSaved: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [custom, setCustom] = useState(false)
  const [saving, setSaving] = useState(false)
  const generic = isGenericCampaign(lead.campaignName)

  const save = async (name: string) => {
    const value = name.trim()
    if (!lead.clientId || !value) { setEditing(false); setCustom(false); return }
    setSaving(true)
    try {
      await fetch('/api/clients', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: lead.clientId, campaignName: value, campaignAttribution: 'manual' }),
      })
      onSaved()
    } catch { /* ignore */ }
    finally { setSaving(false); setEditing(false); setCustom(false) }
  }

  const ctrlS: React.CSSProperties = {
    height: 24, padding: '0 6px', borderRadius: 6, fontSize: '0.66rem', fontWeight: 700,
    border: '1px solid var(--primary, #e6007e)', background: 'var(--bg)', color: 'var(--text-main)',
    fontFamily: 'inherit', outline: 'none', maxWidth: 180,
  }

  if (saving) return <span style={{ fontSize: '0.66rem', color: 'var(--text-muted)' }}>⏳ salvando…</span>

  if (editing && custom) {
    return (
      <input
        autoFocus
        placeholder="Nome da campanha"
        defaultValue={generic ? '' : lead.campaignName || ''}
        onKeyDown={e => {
          if (e.key === 'Enter') save((e.target as HTMLInputElement).value)
          if (e.key === 'Escape') { setEditing(false); setCustom(false) }
        }}
        onBlur={e => { if (e.target.value.trim()) save(e.target.value); else { setEditing(false); setCustom(false) } }}
        style={ctrlS}
      />
    )
  }

  if (editing) {
    return (
      <select
        autoFocus
        defaultValue=""
        onChange={e => {
          const v = e.target.value
          if (v === '__custom__') setCustom(true)
          else if (v) save(v)
        }}
        onBlur={() => setEditing(false)}
        style={{ ...ctrlS, cursor: 'pointer' }}
      >
        <option value="" disabled>Escolher campanha…</option>
        {options.map(c => <option key={c} value={c}>{c}</option>)}
        <option value="__custom__">✏️ Outra (digitar)…</option>
      </select>
    )
  }

  return (
    <button
      onClick={() => setEditing(true)}
      title="Atribuir / corrigir campanha"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer',
        padding: '2px 8px', borderRadius: 6, fontFamily: 'inherit',
        fontSize: '0.68rem', fontWeight: 700,
        color: generic ? '#f59e0b' : '#6366f1',
        background: generic ? 'rgba(245,158,11,0.1)' : 'rgba(99,102,241,0.1)',
        border: generic ? '1px dashed rgba(245,158,11,0.45)' : '1px solid transparent',
        transition: 'all 0.2s ease',
      }}
      onMouseEnter={(e) => e.currentTarget.style.opacity = '0.8'}
      onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
    >
      <span className="material-symbols-outlined" style={{ fontSize: 12 }}>campaign</span> 
      {lead.campaignName || 'Sem campanha'}
      <span className="material-symbols-outlined" style={{ fontSize: 10, opacity: 0.7, marginLeft: 2 }}>edit</span>
    </button>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CampanhasPage() {
  const { globalUnit } = useGlobalUnit()
  const [data, setData] = useState<CampaignData | null>(null)
  const [loading, setLoading] = useState(true)
  // ── Filters ──
  const [filterFrom, setFilterFrom] = useState(todayDateInput)
  const [filterTo, setFilterTo] = useState(todayDateInput)
  const [filterCampaign, setFilterCampaign] = useState('')
  const [expandedCampaign, setExpandedCampaign] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (globalUnit) params.set('unit', globalUnit)
      if (filterFrom) params.set('from', filterFrom)
      if (filterTo) params.set('to', filterTo)
      if (filterCampaign) params.set('campaign', filterCampaign)
      const res = await fetch(`/api/campaigns?${params}`)
      const json: CampaignData = await res.json()
      setData(json)
    } catch {
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [globalUnit, filterFrom, filterTo, filterCampaign])

  useEffect(() => { fetchData() }, [fetchData])

  const kpis = data?.kpis
  const campaigns = data?.campaigns || []
  const bySource = data?.bySource || []
  const monthlyMeta = data?.monthlyMeta || []
  const recentLeads = data?.recentLeads || []
  const salesSummary = data?.salesSummary
  const salesByType = data?.salesByType || []
  const procedures = data?.procedures || []
  const procedureCombinations = data?.procedureCombinations || []
  const demandByOrigin = data?.demandByOrigin || []
  const detailedSales = data?.detailedSales
  const maxMonthly = Math.max(...monthlyMeta.map(m => m.count), 1)
  const totalSourceLeads = bySource.reduce((s, b) => s + b.total, 0)
  // Campanhas "reais" registradas (exclui os rótulos genéricos) — para o seletor
  const campaignOptions = (data?.availableCampaigns || campaigns.map(c => c.campaignName))
    .filter(n => !isGenericCampaign(n))
    .sort((a, b) => a.localeCompare(b, 'pt-BR'))

  const generatePdf = async () => {
    if (!data) return
    const { generateCampaignReportPdf } = await import('@/lib/campaign-report')
    await generateCampaignReportPdf({
      unit: globalUnit || 'Todas as unidades',
      from: filterFrom,
      to: filterTo,
      kpis: data.kpis,
      campaigns: data.campaigns,
      bySource: data.bySource,
      salesSummary: data.salesSummary,
      salesByType: data.salesByType,
      procedures: data.procedures,
      procedureCombinations: data.procedureCombinations,
      demandByOrigin: data.demandByOrigin,
      detailedSales: data.detailedSales,
      criteria: data.criteria,
    })
  }

  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200" rel="stylesheet" />
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '16px 20px 40px' }}>

        {/* ── Header ── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
          <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--text-muted)', fontWeight: 500 }}>
            Desempenho de campanhas Meta Ads e origens de leads
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={generatePdf} disabled={!data || loading} style={{
              ...cardS, padding: '9px 14px', display: 'flex', alignItems: 'center', gap: 6,
              fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-main)', cursor: !data || loading ? 'not-allowed' : 'pointer',
              opacity: !data || loading ? 0.55 : 1,
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>picture_as_pdf</span>
              Gerar PDF
            </button>
            <a href="/crm/campanhas/gerenciar" style={{
              ...cardS, padding: '9px 18px', display: 'flex', alignItems: 'center', gap: 6,
              fontSize: '0.82rem', fontWeight: 700, color: '#fff', textDecoration: 'none',
              background: 'linear-gradient(135deg, var(--primary), #ff4db1)', border: 'none',
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>edit_note</span>
              Gerenciar Campanhas
            </a>
          </div>
        </div>

        {/* ── Filter Bar ── */}
        <div className="flex flex-wrap items-end gap-4 rounded-xl border border-border/50 bg-card p-4 mb-5 shadow-sm">
          <div className="min-w-[155px]">
            <label className="mb-1.5 flex items-center gap-1.5 text-[0.65rem] font-bold uppercase tracking-wider text-muted-foreground/80">
              <span className="material-symbols-outlined text-[14px]">date_range</span>
              Período Inicial
            </label>
            <DatePicker value={filterFrom} onChange={setFilterFrom} variant="compact" placeholder="Data inicial" />
          </div>
          <div className="min-w-[155px]">
            <label className="mb-1.5 flex items-center gap-1.5 text-[0.65rem] font-bold uppercase tracking-wider text-muted-foreground/80">
              <span className="material-symbols-outlined text-[14px]">event</span>
              Período Final
            </label>
            <DatePicker value={filterTo} onChange={setFilterTo} variant="compact" placeholder="Data final" />
          </div>
          <div className="min-w-[200px] flex-1">
            <label className="mb-1.5 flex items-center gap-1.5 text-[0.65rem] font-bold uppercase tracking-wider text-muted-foreground/80">
              <span className="material-symbols-outlined text-[14px]">campaign</span>
              Campanha
            </label>
            <div className="relative">
              <select 
                value={filterCampaign} 
                onChange={e => setFilterCampaign(e.target.value)}
                className="h-9 w-full appearance-none rounded-md border border-border/50 bg-background px-3 py-1 text-sm font-medium text-foreground outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary/50 cursor-pointer"
              >
                <option value="">Todas as campanhas</option>
                {(data?.availableCampaigns || []).map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                <span className="material-symbols-outlined text-[16px]">expand_more</span>
              </div>
            </div>
          </div>
          {(filterFrom || filterTo || filterCampaign) && (
            <button 
              onClick={() => { setFilterFrom(''); setFilterTo(''); setFilterCampaign(''); }}
              className="flex h-9 shrink-0 items-center gap-1.5 rounded-md bg-primary/10 px-4 text-xs font-bold text-primary transition-colors hover:bg-primary/20"
            >
              <span className="material-symbols-outlined text-[16px]">filter_alt_off</span>
              Limpar
            </button>
          )}
        </div>

        {loading ? (
          <div style={{ ...cardS, textAlign: 'center', padding: '80px 20px' }}>
            <span className="material-symbols-outlined spinning" style={{ fontSize: 40, color: 'var(--primary)', opacity: 0.4 }}>progress_activity</span>
            <p style={{ color: 'var(--text-muted)', marginTop: 12, fontSize: '0.88rem' }}>Carregando dados...</p>
          </div>
        ) : (
          <>
            {/* ── KPI Cards ── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
              {[
                { icon: 'group_add',    color: '#6366f1', label: 'Leads recebidos',    value: String(kpis?.totalLeads ?? 0) },
                { icon: 'verified',     color: '#0668E1', label: 'Meta confirmado',    value: String(kpis?.totalMetaLeads ?? 0) },
                { icon: 'pending',      color: '#f59e0b', label: 'Meta a validar',     value: String(kpis?.pendingMetaLeads ?? 0) },
                { icon: 'check_circle', color: '#10b981', label: 'Convertidos',        value: String(kpis?.totalConvertidos ?? 0) },
                { icon: 'trending_up',  color: '#f59e0b', label: 'Taxa Conversão',     value: `${kpis?.taxaConversao ?? '0'}%` },
                { icon: 'payments',     color: '#8b5cf6', label: 'Receita de aquisição Meta', value: fmt(kpis?.totalReceita ?? 0) },
                { icon: 'autorenew',    color: '#a855f7', label: 'Receita recorrente Meta', value: fmt(kpis?.totalReceitaRecorrente ?? 0) },
                { icon: 'monitoring',   color: '#14b8a6', label: 'LTV atribuído Meta', value: fmt(kpis?.totalReceitaLifetime ?? 0) },
                { icon: 'monetization_on', color: '#ec4899', label: 'Orçamento cadastrado', value: kpis?.totalBudget ? fmt(kpis.totalBudget) : 'Não informado' },
                { icon: 'price_change', color: '#3b82f6', label: 'CPL Médio',          value: kpis?.overallCpl ? fmt(kpis.overallCpl) : 'R$ 0,00' },
                { icon: 'person_search', color: '#10b981', label: 'CAC Médio',          value: kpis?.overallCac ? fmt(kpis.overallCac) : 'R$ 0,00' },
                { icon: 'show_chart',   color: '#f59e0b', label: 'ROAS Geral',         value: kpis?.overallRoas ? `${kpis.overallRoas.toFixed(1)}x` : '0.0x' },
              ].map(kpi => (
                <div key={kpi.label} className="rounded-xl border border-border/50 bg-card p-4 flex flex-col justify-center transition-all hover:shadow-md">
                  <div className="flex items-center gap-2 mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80">
                    <div className="flex items-center justify-center p-1.5 rounded-md" style={{ background: `${kpi.color}15` }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 16, color: kpi.color }}>{kpi.icon}</span>
                    </div>
                    <span>{kpi.label}</span>
                  </div>
                  <div className="text-[1.1rem] font-bold text-foreground mt-1 truncate" title={kpi.value}>{kpi.value}</div>
                </div>
              ))}
            </div>

            <div style={{ ...cardS, marginBottom: 20, padding: '14px 16px', borderLeft: '3px solid #0668E1', background: 'rgba(6,104,225,0.05)' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <span className="material-symbols-outlined" style={{ color: '#0668E1', fontSize: 20 }}>fact_check</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '0.82rem', fontWeight: 800, marginBottom: 4 }}>Critério de precisão</div>
                  <div style={{ fontSize: '0.74rem', lineHeight: 1.5, color: 'var(--text-muted)' }}>
                    A conversão de campanha considera a primeira compra do cliente realizada em até 30 dias após a entrada do lead. Compras posteriores aparecem como recorrência/LTV e não aumentam o ROAS de aquisição. Há {kpis?.unassignedConfirmedMetaLeads ?? 0} Meta confirmado(s) sem campanha cadastrada e {kpis?.pendingMetaLeads ?? 0} registro(s) histórico(s) a validar.
                  </div>
                </div>
              </div>
            </div>

            {/* ── Row: Campanhas Table + Leads/Mês ── */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16, marginBottom: 20 }}>

              {/* Tabela de campanhas */}
              <div style={cardS}>
                <h3 style={{ margin: '0 0 16px', fontSize: '0.95rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#0668E1' }}>analytics</span>
                  Performance por Campanha
                </h3>

                {campaigns.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '48px 0' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 48, color: 'var(--text-muted)', opacity: 0.15 }}>campaign</span>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 8 }}>Nenhuma campanha detectada ainda</p>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>Configure o webhook do Meta para começar a rastrear</p>
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '0 4px' }}>
                      <thead>
                        <tr>
                          {['Campanha', 'Orçamento', 'Leads', 'Clientes', 'Compradores', 'Conversão', 'CPL', 'CAC', 'ROAS', 'Receita aquisição', 'Receita recorrente', 'Detalhes'].map(h => (
                            <th key={h} style={{
                              fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)',
                              textTransform: 'uppercase' as const, letterSpacing: '0.5px',
                              padding: '8px 10px', textAlign: h === 'Campanha' ? 'left' : h.startsWith('Receita') ? 'right' : 'center',
                              whiteSpace: 'nowrap',
                            }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {campaigns.map((c, i) => {
                          const cpl = c.leads > 0 ? c.budget / c.leads : 0
                          const cac = c.convertidos > 0 ? c.budget / c.convertidos : 0
                          const roas = c.budget > 0 ? c.receita / c.budget : 0
                          const isExpanded = expandedCampaign === c.campaignName
                          return (
                            <Fragment key={c.campaignName}>
                            <tr style={{ background: i % 2 === 0 ? 'var(--bg)' : 'transparent' }}>
                              <td style={{ padding: '10px', borderRadius: '8px 0 0 8px' }}>
                                <div style={{ fontSize: '0.85rem', fontWeight: 700 }}>{c.campaignName}</div>
                                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{c.platform}</div>
                              </td>
                              <td style={{ textAlign: 'center', padding: '10px', fontSize: '0.82rem', fontWeight: 700 }}>
                                {c.budget > 0 ? fmt(c.budget) : 'Não informado'}
                              </td>
                              <td style={{ textAlign: 'center', padding: '10px', fontSize: '0.88rem', fontWeight: 800 }}>{c.leads}</td>
                              <td style={{ textAlign: 'center', padding: '10px', fontSize: '0.88rem', fontWeight: 800 }}>{c.uniqueClients}</td>
                              <td style={{ textAlign: 'center', padding: '10px' }}>
                                <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#10b981' }}>{c.buyerClients}</span>
                              </td>
                              <td style={{ textAlign: 'center', padding: '10px', fontSize: '0.82rem', fontWeight: 800 }}>
                                {c.conversionRate.toFixed(1)}%
                              </td>
                              <td style={{ textAlign: 'center', padding: '10px', fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                                {cpl > 0 ? fmt(cpl) : '—'}
                              </td>
                              <td style={{ textAlign: 'center', padding: '10px', fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                                {cac > 0 ? fmt(cac) : '—'}
                              </td>
                              <td style={{ textAlign: 'center', padding: '10px' }}>
                                <span style={{
                                  padding: '3px 8px', borderRadius: 6, fontSize: '0.72rem', fontWeight: 800,
                                  background: roas >= 4 ? 'rgba(16,185,129,0.1)' : roas >= 1.5 ? 'rgba(245,158,11,0.1)' : roas > 0 ? 'rgba(239,68,68,0.1)' : 'transparent',
                                  color: roas >= 4 ? '#10b981' : roas >= 1.5 ? '#f59e0b' : roas > 0 ? '#ef4444' : 'var(--text-muted)',
                                }}>{roas > 0 ? `${roas.toFixed(1)}x` : '—'}</span>
                              </td>
                              <td style={{ textAlign: 'right', padding: '10px' }}>
                                <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#10b981' }}>{fmt(c.receita)}</span>
                              </td>
                              <td style={{ textAlign: 'right', padding: '10px' }}>
                                <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#8b5cf6' }}>{fmt(c.receitaRecorrente)}</span>
                              </td>
                              <td style={{ textAlign: 'center', padding: '10px', borderRadius: '0 8px 8px 0' }}>
                                <button
                                  type="button"
                                  onClick={() => setExpandedCampaign(isExpanded ? null : c.campaignName)}
                                  aria-expanded={isExpanded}
                                  className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-bold text-foreground hover:bg-muted/50"
                                >
                                  {isExpanded ? 'Ocultar' : 'Ver compras'}
                                  <span className="material-symbols-outlined text-[15px]">{isExpanded ? 'expand_less' : 'expand_more'}</span>
                                </button>
                              </td>
                            </tr>
                            {isExpanded && (
                              <tr>
                                <td colSpan={12} className="px-2 pb-3 pt-1">
                                  <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4">
                                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                                      <div>
                                        <div className="text-sm font-black text-foreground">Compras atribuídas a {c.campaignName}</div>
                                        <div className="mt-0.5 text-[11px] text-muted-foreground">Primeira compra realizada em até 30 dias após a entrada do cliente.</div>
                                      </div>
                                      <div className="flex flex-wrap gap-2 text-[11px]">
                                        <span className="rounded-full bg-blue-500/10 px-2.5 py-1 font-bold text-blue-500">{c.uniqueClients} clientes chegaram</span>
                                        <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 font-bold text-emerald-500">{c.buyerClients} compraram</span>
                                        <span className="rounded-full bg-violet-500/10 px-2.5 py-1 font-bold text-violet-500">{c.acquisitionPackages} primeira(s) compra(s)</span>
                                        <span className="rounded-full bg-fuchsia-500/10 px-2.5 py-1 font-bold text-fuchsia-500">{c.recurringPackages} pacote(s) posterior(es)</span>
                                      </div>
                                    </div>
                                    <div className="overflow-x-auto rounded-lg border border-border/60 bg-background">
                                      <table className="w-full border-collapse text-xs">
                                        <thead className="bg-muted/40 text-muted-foreground">
                                          <tr>
                                            <th className="px-3 py-2 text-left">Procedimento da primeira compra</th>
                                            <th className="px-3 py-2 text-center">Clientes</th>
                                            <th className="px-3 py-2 text-center">Pacotes</th>
                                            <th className="px-3 py-2 text-right">Valor dos pacotes</th>
                                            <th className="px-3 py-2 text-right">Ticket médio</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {c.procedures.length > 0 ? c.procedures.map(procedure => (
                                            <tr key={procedure.name} className="border-t border-border/50">
                                              <td className="px-3 py-2 font-bold text-foreground">{procedure.name}</td>
                                              <td className="px-3 py-2 text-center">{procedure.clients}</td>
                                              <td className="px-3 py-2 text-center">{procedure.packages}</td>
                                              <td className="px-3 py-2 text-right font-bold text-emerald-500">{fmt(procedure.packageRevenue)}</td>
                                              <td className="px-3 py-2 text-right">{fmt(procedure.averagePackageTicket)}</td>
                                            </tr>
                                          )) : (
                                            <tr><td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">Nenhum procedimento registrado nas primeiras compras desta campanha.</td></tr>
                                          )}
                                        </tbody>
                                      </table>
                                    </div>
                                    {c.salesWithoutProcedures > 0 && (
                                      <div className="mt-2 text-[11px] font-medium text-amber-600">{c.salesWithoutProcedures} primeira(s) compra(s) sem procedimentos registrados.</div>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            )}
                            </Fragment>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Leads Meta por mês */}
              <div style={cardS}>
                <h3 style={{ margin: '0 0 16px', fontSize: '0.95rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#10b981' }}>show_chart</span>
                  Meta Confirmado / Mês
                </h3>
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', height: 180, padding: '0 4px' }}>
                  {monthlyMeta.map(m => (
                    <div key={m.label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                      <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#0668E1' }}>{m.count}</span>
                      <div style={{
                        width: '100%', height: `${(m.count / maxMonthly) * 140}px`, minHeight: 4,
                        background: 'linear-gradient(180deg, #0668E1, #0668E1aa)',
                        borderRadius: '6px 6px 0 0', transition: 'height 0.5s ease',
                      }} />
                      <span style={{ fontSize: '0.6rem', fontWeight: 600, color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.2 }}>{m.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* ── Vendas da unidade ── */}
            <div style={{ ...cardS, marginBottom: 20, borderTop: '3px solid #10b981' }}>
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="m-0 flex items-center gap-2 text-[0.95rem] font-black">
                    <span className="material-symbols-outlined text-[20px] text-emerald-500">point_of_sale</span>
                    Vendas da unidade no período
                  </h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Inclui vendas originadas por leads, recorrências e fechamentos realizados diretamente na clínica.
                  </p>
                </div>
                <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-500">
                  Base: data do fechamento
                </span>
              </div>

              <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                {[
                  { label: 'Pacotes fechados', value: String(salesSummary?.totalSales ?? 0), icon: 'inventory_2', color: '#10b981' },
                  { label: 'Clientes únicos', value: String(salesSummary?.uniqueClients ?? 0), icon: 'groups', color: '#3b82f6' },
                  { label: 'Receita total', value: fmt(salesSummary?.totalRevenue ?? 0), icon: 'payments', color: '#8b5cf6' },
                  { label: 'Ticket médio', value: fmt(salesSummary?.averageTicket ?? 0), icon: 'price_check', color: '#f59e0b' },
                ].map(item => (
                  <div key={item.label} className="rounded-xl border border-border/50 bg-background p-3">
                    <div className="mb-1 flex items-center gap-2 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                      <span className="material-symbols-outlined text-[16px]" style={{ color: item.color }}>{item.icon}</span>
                      {item.label}
                    </div>
                    <div className="truncate text-base font-black text-foreground" title={item.value}>{item.value}</div>
                  </div>
                ))}
              </div>

              <div className="mb-5 grid gap-3 md:grid-cols-3">
                {salesByType.map(item => {
                  const info = SALE_TYPE_LABELS[item.type]
                  return (
                    <div key={item.type} className="rounded-xl border border-border/50 bg-background p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 text-xs font-bold text-foreground">
                          <span className="material-symbols-outlined text-[18px]" style={{ color: info.color }}>{info.icon}</span>
                          {info.label}
                        </div>
                        <span className="rounded-full px-2 py-0.5 text-xs font-black" style={{ color: info.color, background: `${info.color}15` }}>
                          {item.sales}
                        </span>
                      </div>
                      <div className="mt-2 text-sm font-black" style={{ color: info.color }}>{fmt(item.revenue)}</div>
                    </div>
                  )
                })}
              </div>

              <div className="mb-5">
                <div className="mb-2 text-xs font-black uppercase tracking-wide text-muted-foreground">Origem comercial dos fechamentos</div>
                <div className="grid gap-3 md:grid-cols-3">
                  {demandByOrigin.map(item => {
                    const info = DEMAND_ORIGIN_LABELS[item.origin]
                    return (
                      <div key={item.origin} className="rounded-xl border border-border/50 bg-background p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex gap-2">
                            <span className="material-symbols-outlined text-[18px]" style={{ color: info.color }}>{info.icon}</span>
                            <div>
                              <div className="text-xs font-black text-foreground">{info.label}</div>
                              <div className="mt-0.5 text-[10px] leading-snug text-muted-foreground">{info.description}</div>
                            </div>
                          </div>
                          <span className="rounded-full px-2 py-0.5 text-xs font-black" style={{ color: info.color, background: `${info.color}15` }}>{item.packages}</span>
                        </div>
                        <div className="mt-3 flex items-end justify-between gap-2">
                          <div className="text-sm font-black" style={{ color: info.color }}>{fmt(item.revenue)}</div>
                          <div className="text-[10px] font-bold text-muted-foreground">{item.clients} cliente(s)</div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              <div className="mb-5 rounded-xl border border-violet-500/25 bg-violet-500/5 p-4">
                <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="text-xs font-black uppercase tracking-wide text-violet-500">Análise detalhada dos itens vendidos</div>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Valores exatos por procedimento, considerando sessões, desconto, cortesia e classificação da oferta da campanha.
                    </p>
                  </div>
                  <span className="rounded-full bg-violet-500/10 px-3 py-1 text-[11px] font-black text-violet-500">
                    {detailedSales?.coverage.detailedDeals ?? 0} de {salesSummary?.totalSales ?? 0} pacote(s) detalhado(s)
                  </span>
                </div>

                <div className="mb-4 grid grid-cols-2 gap-2 lg:grid-cols-5">
                  {[
                    { label: 'Sessões vendidas', value: String(detailedSales?.coverage.sessions ?? 0) },
                    { label: 'Valor pago nos itens', value: fmt(detailedSales?.coverage.paidRevenue ?? 0) },
                    { label: 'Subtotal de tabela', value: fmt(detailedSales?.coverage.subtotal ?? 0) },
                    { label: 'Desconto concedido', value: fmt(detailedSales?.coverage.discount ?? 0) },
                    { label: 'Sessões cortesia', value: String(detailedSales?.coverage.courtesySessions ?? 0) },
                  ].map(item => (
                    <div key={item.label} className="rounded-lg border border-border/60 bg-background p-3">
                      <div className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground">{item.label}</div>
                      <div className="mt-1 truncate text-sm font-black text-foreground" title={item.value}>{item.value}</div>
                    </div>
                  ))}
                </div>

                {(detailedSales?.procedures.length ?? 0) > 0 ? (
                  <div className="space-y-4">
                    <div className="overflow-x-auto rounded-lg border border-border/60 bg-background">
                      <table className="w-full min-w-[920px] border-collapse text-xs">
                        <thead className="bg-muted/40 text-muted-foreground">
                          <tr>
                            <th className="px-3 py-2 text-left">Procedimento</th>
                            <th className="px-3 py-2 text-center">Sessões</th>
                            <th className="px-3 py-2 text-center">Pacotes</th>
                            <th className="px-3 py-2 text-right">Valor pago</th>
                            <th className="px-3 py-2 text-right">Desconto</th>
                            <th className="px-3 py-2 text-center">Da campanha</th>
                            <th className="px-3 py-2 text-center">Adicionais</th>
                            <th className="px-3 py-2 text-center">Cortesia</th>
                            <th className="px-3 py-2 text-right">Não é lead</th>
                          </tr>
                        </thead>
                        <tbody>
                          {detailedSales!.procedures.map(procedure => (
                            <tr key={procedure.name} className="border-t border-border/50">
                              <td className="px-3 py-2 font-bold text-foreground">{procedure.name}</td>
                              <td className="px-3 py-2 text-center font-black">{procedure.sessions}</td>
                              <td className="px-3 py-2 text-center">{procedure.packages}</td>
                              <td className="px-3 py-2 text-right font-black text-emerald-500">{fmt(procedure.paidRevenue)}</td>
                              <td className="px-3 py-2 text-right text-amber-500">{fmt(procedure.discount)}</td>
                              <td className="px-3 py-2 text-center text-violet-500">{procedure.includedSessions}</td>
                              <td className="px-3 py-2 text-center font-black text-fuchsia-500">{procedure.additionalSessions}</td>
                              <td className="px-3 py-2 text-center text-sky-500">{procedure.courtesySessions}</td>
                              <td className="px-3 py-2 text-right">
                                <div className="font-bold">{procedure.byOrigin.nao_lead.sessions} sessão(ões)</div>
                                <div className="text-[10px] text-muted-foreground">{fmt(procedure.byOrigin.nao_lead.paidRevenue)}</div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {(detailedSales?.campaignUpsell.length ?? 0) > 0 && (
                      <div>
                        <div className="mb-2 text-[11px] font-black uppercase tracking-wide text-muted-foreground">Adicionais por campanha</div>
                        <div className="grid gap-2 md:grid-cols-2">
                          {detailedSales!.campaignUpsell.map(campaign => (
                            <div key={campaign.campaignName} className="rounded-lg border border-border/60 bg-background p-3">
                              <div className="flex items-start justify-between gap-2">
                                <div className="font-bold text-foreground">{campaign.campaignName}</div>
                                <span className="rounded-full bg-fuchsia-500/10 px-2 py-0.5 text-[10px] font-black text-fuchsia-500">
                                  {campaign.additionalAttachRate.toFixed(0)}% com adicional
                                </span>
                              </div>
                              <div className="mt-2 grid grid-cols-3 gap-2 text-[10px] text-muted-foreground">
                                <div><strong className="block text-sm text-violet-500">{campaign.includedSessions}</strong>incluídas</div>
                                <div><strong className="block text-sm text-fuchsia-500">{campaign.additionalSessions}</strong>adicionais</div>
                                <div><strong className="block text-sm text-sky-500">{campaign.courtesySessions}</strong>cortesia</div>
                              </div>
                              <div className="mt-2 text-[10px] text-muted-foreground">
                                Valor de itens totalmente adicionais: <strong className="text-foreground">{fmt(campaign.additionalPaidRevenue)}</strong>
                                {campaign.mixedPaidRevenue > 0 && <> · itens mistos: <strong className="text-foreground">{fmt(campaign.mixedPaidRevenue)}</strong></>}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div>
                      <div className="mb-2 text-[11px] font-black uppercase tracking-wide text-muted-foreground">Pacotes detalhados</div>
                      <div className="overflow-x-auto rounded-lg border border-border/60 bg-background">
                        <table className="w-full min-w-[900px] border-collapse text-xs">
                          <thead className="bg-muted/40 text-muted-foreground">
                            <tr>
                              <th className="px-3 py-2 text-left">Cliente</th>
                              <th className="px-3 py-2 text-left">Origem</th>
                              <th className="px-3 py-2 text-left">Campanha</th>
                              <th className="px-3 py-2 text-left">Procedimentos</th>
                              <th className="px-3 py-2 text-center">Sessões</th>
                              <th className="px-3 py-2 text-right">Valor pago</th>
                            </tr>
                          </thead>
                          <tbody>
                            {detailedSales!.packages.map(pkg => (
                              <tr key={pkg.dealId} className="border-t border-border/50 align-top">
                                <td className="px-3 py-2 font-bold text-foreground">{pkg.clientName}</td>
                                <td className="px-3 py-2">{DEMAND_ORIGIN_LABELS[pkg.origin].label}</td>
                                <td className="px-3 py-2">{pkg.campaignName || '—'}</td>
                                <td className="px-3 py-2">
                                  <div className="space-y-1">
                                    {pkg.procedures.map(item => (
                                      <div key={`${pkg.dealId}-${item.name}`}>
                                        <span className="font-semibold text-foreground">{item.name}</span>
                                        <span className="text-muted-foreground"> · {item.sessions} sessão(ões) · {fmt(item.paidAmount)}</span>
                                        {item.itemType === 'courtesy' && <span className="ml-1 font-bold text-sky-500">cortesia</span>}
                                        {item.additionalSessions > 0 && <span className="ml-1 font-bold text-fuchsia-500">+{item.additionalSessions} adicional(is)</span>}
                                      </div>
                                    ))}
                                  </div>
                                </td>
                                <td className="px-3 py-2 text-center font-black">{pkg.sessions}</td>
                                <td className="px-3 py-2 text-right font-black text-emerald-500">{fmt(pkg.paidRevenue)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-violet-500/30 bg-background p-6 text-center text-xs text-muted-foreground">
                    Os próximos fechamentos feitos com a ficha detalhada aparecerão aqui. Os registros anteriores continuam na visão histórica abaixo.
                  </div>
                )}

                {(detailedSales?.coverage.legacyDeals ?? 0) > 0 && (
                  <div className="mt-3 text-[11px] text-amber-600 dark:text-amber-400">
                    {detailedSales?.coverage.legacyDeals} fechamento(s) do período ainda usam o formato anterior; por isso não possuem valor exato por procedimento.
                  </div>
                )}
              </div>

              <div className="grid gap-4">
                <div>
                  <div className="mb-2 text-xs font-black uppercase tracking-wide text-muted-foreground">Visão histórica por pacote e origem</div>
                  <div className="overflow-x-auto rounded-lg border border-border/60">
                    <table className="w-full border-collapse text-xs">
                      <thead className="bg-muted/40 text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2 text-left">Procedimento</th>
                          <th className="px-3 py-2 text-center">Total</th>
                          <th className="px-3 py-2 text-center">Clientes</th>
                          <th className="px-3 py-2 text-right">Lead com campanha</th>
                          <th className="px-3 py-2 text-right">Outros leads</th>
                          <th className="px-3 py-2 text-right">Não é lead</th>
                          <th className="px-3 py-2 text-right">Valor total dos pacotes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {procedures.length > 0 ? procedures.slice(0, 10).map(procedure => (
                          <tr key={procedure.name} className="border-t border-border/50">
                            <td className="px-3 py-2 font-bold text-foreground">{procedure.name}</td>
                            <td className="px-3 py-2 text-center">{procedure.packages}</td>
                            <td className="px-3 py-2 text-center">{procedure.clients}</td>
                            {(['lead_com_campanha', 'outro_lead', 'nao_lead'] as DemandOrigin[]).map(origin => {
                              const originData = procedure.byOrigin[origin]
                              const info = DEMAND_ORIGIN_LABELS[origin]
                              return (
                                <td key={origin} className="px-3 py-2 text-right">
                                  <div className="font-black" style={{ color: info.color }}>{originData.packages} pacote(s)</div>
                                  <div className="mt-0.5 text-[10px] text-muted-foreground">{fmt(originData.packageRevenue)}</div>
                                </td>
                              )
                            })}
                            <td className="px-3 py-2 text-right font-black text-emerald-500">{fmt(procedure.packageRevenue)}</td>
                          </tr>
                        )) : (
                          <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">Nenhum procedimento registrado no período.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                    “Receita dos pacotes” representa o valor total dos pacotes que contêm o procedimento. Como um pacote pode ter vários procedimentos, essas receitas não devem ser somadas entre si.
                  </p>
                </div>

                <div>
                  <div className="mb-2 text-xs font-black uppercase tracking-wide text-muted-foreground">Combinações mais vendidas</div>
                  <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                    {procedureCombinations.length > 0 ? procedureCombinations.slice(0, 6).map(combination => (
                      <div key={combination.name} className="rounded-lg border border-border/60 bg-background px-3 py-2">
                        <div className="line-clamp-2 text-xs font-bold text-foreground">{combination.name}</div>
                        <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
                          <span>{combination.packages} pacote(s)</span>
                          <span className="font-bold text-emerald-500">{fmt(combination.revenue)}</span>
                        </div>
                      </div>
                    )) : (
                      <div className="rounded-lg border border-dashed border-border p-8 text-center text-xs text-muted-foreground">
                        Nenhuma combinação registrada.
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {((salesSummary?.incompleteValueSales ?? 0) > 0 || (salesSummary?.salesWithoutProcedures ?? 0) > 0) && (
                <div className="mt-4 flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
                  <span className="material-symbols-outlined text-[18px]">warning</span>
                  <span>
                    Qualidade dos dados: {salesSummary?.incompleteValueSales ?? 0} fechamento(s) sem valor e {salesSummary?.salesWithoutProcedures ?? 0} sem procedimentos registrados.
                  </span>
                </div>
              )}
            </div>

            {/* ── Row: Origem dos Leads + Leads Recentes ── */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: 16, marginBottom: 20 }}>

              {/* Distribuição por origem */}
              <div style={cardS}>
                <h3 style={{ margin: '0 0 16px', fontSize: '0.95rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#8b5cf6' }}>donut_small</span>
                  Origem dos Leads
                </h3>

                {bySource.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    Nenhum dado disponível
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {bySource.map(s => {
                      const info = SOURCE_LABELS[s.source] || SOURCE_LABELS['outro']
                      const pct = totalSourceLeads > 0 ? ((s.total / totalSourceLeads) * 100).toFixed(0) : '0'
                      const barWidth = totalSourceLeads > 0 ? Math.max((s.total / totalSourceLeads) * 100, 5) : 0
                      return (
                        <div key={s.source}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span className="material-symbols-outlined" style={{ fontSize: 16, color: info.color }}>{info.icon}</span>
                              <span style={{ fontSize: '0.82rem', fontWeight: 700 }}>{info.label}</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ fontSize: '0.78rem', fontWeight: 800, color: info.color }}>{s.total}</span>
                              <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>({pct}%)</span>
                            </div>
                          </div>
                          <div style={{ height: 8, background: 'var(--bg)', borderRadius: 4, overflow: 'hidden' }}>
                            <div style={{
                              height: '100%', width: `${barWidth}%`,
                              background: `linear-gradient(90deg, ${info.color}, ${info.color}88)`,
                              borderRadius: 4, transition: 'width 0.5s ease',
                            }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Últimos leads recebidos */}
              <div style={cardS}>
                <h3 style={{ margin: '0 0 16px', fontSize: '0.95rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#f59e0b' }}>history</span>
                  Últimos Leads Recebidos
                </h3>

                {recentLeads.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '40px 0' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 44, color: 'var(--text-muted)', opacity: 0.12 }}>person_add</span>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 8 }}>Nenhum lead capturado via Meta ainda</p>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>Leads do webhook aparecerão aqui automaticamente</p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 400, overflowY: 'auto' }}>
                    {recentLeads.map(lead => {
                      const stage = lead.clientStage ? STAGE_LABELS[lead.clientStage] : null
                      const time = new Date(lead.leadAt)
                      const attribution = lead.attribution ? ATTRIBUTION_LABELS[lead.attribution] : null
                      const origin = SOURCE_LABELS[lead.platform] || SOURCE_LABELS.outro
                      return (
                        <div key={lead.id} style={{
                          background: 'var(--bg)', borderRadius: 12, padding: '12px 14px',
                          border: '1px solid var(--border)', boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden' }}>
                              <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: stage?.color || '#6366f1', flexShrink: 0 }} />
                              <span style={{ fontSize: '0.85rem', fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {lead.name || 'Sem nome'}
                              </span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                              {stage && (
                                <span style={{
                                  padding: '2px 8px', borderRadius: 6, fontSize: '0.62rem', fontWeight: 800,
                                  background: `${stage.color}14`, color: stage.color,
                                }}>{stage.label}</span>
                              )}
                              <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                                {time.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                              </span>
                            </div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                            <LeadCampaignSelect lead={lead} options={campaignOptions} onSaved={fetchData} />
                            {attribution && <span style={{ color: attribution.color, fontSize: '0.68rem', fontWeight: 800 }}>· {attribution.label}</span>}
                            {!lead.isRegisteredCampaign && lead.campaignName && <span style={{ color: '#f59e0b', fontSize: '0.68rem', fontWeight: 800 }}>· não cadastrada</span>}
                            {lead.platform && <span>· {origin.label}</span>}
                            {lead.phone && <span>· {lead.phone}</span>}
                            {lead.unit && <span>· {lead.unit}</span>}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* ── Info box: Como configurar ── */}
            <div style={{
              ...cardS, padding: '20px 24px',
              background: 'linear-gradient(135deg, rgba(6,104,225,0.05), rgba(230,0,126,0.05))',
              borderColor: 'rgba(6,104,225,0.15)',
            }}>
              <h3 style={{ margin: '0 0 12px', fontSize: '0.9rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#0668E1' }}>integration_instructions</span>
                Como funciona a integração
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
                {[
                  { step: '1', title: 'Lead Forms do Meta', desc: 'Leads de formulários do Instagram/Facebook chegam automaticamente via webhook.' },
                  { step: '2', title: 'Classificação Manual', desc: 'A equipe pode indicar uma campanha sem alterar a origem original do lead.' },
                  { step: '3', title: 'UTM em Landing Pages', desc: 'Links com UTM params capturam automaticamente a campanha e fonte.' },
                  { step: '4', title: 'Performance Confiável', desc: 'Somente campanhas cadastradas e Meta confirmado entram nos indicadores de performance.' },
                ].map(item => (
                  <div key={item.step} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                      background: 'var(--primary)', color: '#fff',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '0.78rem', fontWeight: 900,
                    }}>{item.step}</div>
                    <div>
                      <div style={{ fontSize: '0.82rem', fontWeight: 800, marginBottom: 2 }}>{item.title}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>{item.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </>
  )
}
