'use client'

import { useState, useEffect, useCallback } from 'react'
import { useGlobalUnit } from '@/contexts/UnitContext'
import AuthGuard from '@/components/auth-guard'
import { DatePicker } from '@/components/ui/date-picker'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Campaign {
  campaignId:   string | null
  campaignName: string
  leads:        number
  convertidos:  number
  perdidos:     number
  emAndamento:  number
  receita:      number
  platform:     string
  lastLeadAt:   string
  budget:       number
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
  adName:       string | null
  formName:     string | null
  platform:     string
  unit:         string | null
  clientId:     string | null
  clientStage:  string | null
  createdAt:    string
}

interface KPIs {
  totalMetaLeads:   number
  totalConvertidos: number
  totalReceita:     number
  taxaConversao:    string
  totalCampanhas:   number
  totalBudget?:     number
  overallCpl?:      number
  overallCac?:      number
  overallRoas?:     number
}

interface CampaignData {
  kpis:        KPIs
  campaigns:   Campaign[]
  bySource:    SourceData[]
  monthlyMeta: MonthlyData[]
  recentLeads: RecentLead[]
  availableCampaigns: string[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

const SOURCE_LABELS: Record<string, { label: string; color: string; icon: string }> = {
  meta_ads:     { label: 'Meta Ads',     color: '#0668E1', icon: 'ads_click' },
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

// ─── Card base ────────────────────────────────────────────────────────────────

// ─── Card base ────────────────────────────────────────────────────────────────

const cardS: React.CSSProperties = {
  background: 'rgba(var(--card), 0.6)', borderRadius: 16, border: '1px solid rgba(var(--border), 0.5)',
  boxShadow: '0 1px 2px rgba(0,0,0,0.05)', padding: '20px', backdropFilter: 'blur(10px)'
}

// ─── Seletor inline de campanha (classificação manual de leads) ────────────────

const isGenericCampaign = (n: string | null) => !n || n.startsWith('Campanha Desconhecida')

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
        body: JSON.stringify({ id: lead.clientId, campaignName: value, source: 'facebook_ad' }),
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
  const [filterFrom, setFilterFrom] = useState(() => {
    const d = new Date(); d.setDate(1); return d.toISOString().split('T')[0]
  })
  const [filterTo, setFilterTo] = useState(() => new Date().toISOString().split('T')[0])
  const [filterCampaign, setFilterCampaign] = useState('')

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
  const maxMonthly = Math.max(...monthlyMeta.map(m => m.count), 1)
  const totalSourceLeads = bySource.reduce((s, b) => s + b.total, 0)
  // Campanhas "reais" registradas (exclui os rótulos genéricos) — para o seletor
  const campaignOptions = [...new Set(
    campaigns.map(c => c.campaignName).filter(n => !isGenericCampaign(n))
  )].sort()

  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200" rel="stylesheet" />
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '16px 20px 40px' }}>

        {/* ── Header ── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
          <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--text-muted)', fontWeight: 500 }}>
            Desempenho de campanhas Meta Ads e origens de leads
          </p>
          <a href="/crm/campanhas/gerenciar" style={{
            ...cardS, padding: '9px 18px', display: 'flex', alignItems: 'center', gap: 6,
            fontSize: '0.82rem', fontWeight: 700, color: '#fff', textDecoration: 'none',
            background: 'linear-gradient(135deg, var(--primary), #ff4db1)', border: 'none',
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>edit_note</span>
            Gerenciar Campanhas
          </a>
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
                { icon: 'ads_click',    color: '#0668E1', label: 'Leads Meta',        value: String(kpis?.totalMetaLeads ?? 0) },
                { icon: 'check_circle', color: '#10b981', label: 'Convertidos',        value: String(kpis?.totalConvertidos ?? 0) },
                { icon: 'trending_up',  color: '#f59e0b', label: 'Taxa Conversão',     value: `${kpis?.taxaConversao ?? '0'}%` },
                { icon: 'payments',     color: '#8b5cf6', label: 'Receita via Meta',   value: fmt(kpis?.totalReceita ?? 0) },
                { icon: 'monetization_on', color: '#ec4899', label: 'Investimento Total', value: fmt(kpis?.totalBudget ?? 0) },
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

            {/* ── Row: Campanhas Table + Leads/Mês ── */}
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, marginBottom: 20 }}>

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
                          {['Campanha', 'Orçamento', 'Leads', 'Conv.', 'CPL', 'CAC', 'ROAS', 'Receita'].map(h => (
                            <th key={h} style={{
                              fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)',
                              textTransform: 'uppercase' as const, letterSpacing: '0.5px',
                              padding: '8px 10px', textAlign: h === 'Campanha' ? 'left' : h === 'Receita' ? 'right' : 'center',
                              whiteSpace: 'nowrap',
                            }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {campaigns.map((c, i) => {
                          const taxa = c.leads > 0 ? ((c.convertidos / c.leads) * 100).toFixed(0) : '0'
                          const cpl = c.leads > 0 ? c.budget / c.leads : 0
                          const cac = c.convertidos > 0 ? c.budget / c.convertidos : 0
                          const roas = c.budget > 0 ? c.receita / c.budget : 0
                          return (
                            <tr key={i} style={{ background: i % 2 === 0 ? 'var(--bg)' : 'transparent' }}>
                              <td style={{ padding: '10px', borderRadius: '8px 0 0 8px' }}>
                                <div style={{ fontSize: '0.85rem', fontWeight: 700 }}>{c.campaignName}</div>
                                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{c.platform}</div>
                              </td>
                              <td style={{ textAlign: 'center', padding: '10px', fontSize: '0.82rem', fontWeight: 700 }}>
                                {c.budget > 0 ? fmt(c.budget) : 'R$ 0,00'}
                              </td>
                              <td style={{ textAlign: 'center', padding: '10px', fontSize: '0.88rem', fontWeight: 800 }}>{c.leads}</td>
                              <td style={{ textAlign: 'center', padding: '10px' }}>
                                <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#10b981' }}>{c.convertidos}</span>
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
                              <td style={{ textAlign: 'right', padding: '10px', borderRadius: '0 8px 8px 0' }}>
                                <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#10b981' }}>{fmt(c.receita)}</span>
                              </td>
                            </tr>
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
                  Leads Meta / Mês
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
                      const time = new Date(lead.createdAt)
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
                            {lead.platform && <span>· {lead.platform}</span>}
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
                  { step: '2', title: 'WhatsApp Manual', desc: 'A recepcionista cadastra leads do WhatsApp informando a campanha de origem.' },
                  { step: '3', title: 'UTM em Landing Pages', desc: 'Links com UTM params capturam automaticamente a campanha e fonte.' },
                  { step: '4', title: 'Dashboard Automático', desc: 'Todos os dados são cruzados para calcular conversão e ROI por campanha.' },
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
