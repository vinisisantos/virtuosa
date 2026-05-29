'use client'

import { useState, useEffect, useCallback } from 'react'
import { AppHeader } from '@/components/app-header'
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
  outro:        { label: 'Outro',        color: '#94a3b8', icon: 'more_horiz' },
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

const cardS: React.CSSProperties = {
  background: 'var(--card-bg)', borderRadius: 18, border: '1px solid var(--border)',
  boxShadow: '0 1px 3px rgba(0,0,0,0.04)', padding: '20px',
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

  return (
    <AuthGuard>
      <AppHeader activePage="crm-campanhas" />
      <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200" rel="stylesheet" />
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '16px 20px 40px' }}>

        {/* ── Header ── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 26, color: 'var(--primary)' }}>campaign</span>
              Campanhas
            </h1>
            <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
              Desempenho de campanhas Meta Ads e origens de leads
            </p>
          </div>
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
        <div style={{
          ...cardS, padding: '14px 18px', marginBottom: 20,
          display: 'flex', alignItems: 'flex-end', gap: 14, flexWrap: 'wrap',
        }}>
          <div style={{ minWidth: 155 }}>
            <label style={{ display: 'block', fontSize: '0.58rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.5px', marginBottom: 5 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 11, verticalAlign: 'middle', marginRight: 3 }}>date_range</span>
              Período Inicial
            </label>
            <DatePicker value={filterFrom} onChange={setFilterFrom} variant="compact" placeholder="Data inicial" />
          </div>
          <div style={{ minWidth: 155 }}>
            <label style={{ display: 'block', fontSize: '0.58rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.5px', marginBottom: 5 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 11, verticalAlign: 'middle', marginRight: 3 }}>event</span>
              Período Final
            </label>
            <DatePicker value={filterTo} onChange={setFilterTo} variant="compact" placeholder="Data final" />
          </div>
          <div style={{ minWidth: 200, flex: 1 }}>
            <label style={{ display: 'block', fontSize: '0.58rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.5px', marginBottom: 5 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 11, verticalAlign: 'middle', marginRight: 3 }}>campaign</span>
              Campanha
            </label>
            <select value={filterCampaign} onChange={e => setFilterCampaign(e.target.value)}
              style={{ width: '100%', height: 36, padding: '0 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-main)', fontSize: '0.78rem', fontFamily: 'inherit', fontWeight: 600, outline: 'none', boxSizing: 'border-box' as const, cursor: 'pointer' }}>
              <option value="">Todas as campanhas</option>
              {(data?.availableCampaigns || []).map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          {(filterFrom || filterTo || filterCampaign) && (
            <button onClick={() => { setFilterFrom(''); setFilterTo(''); setFilterCampaign(''); }}
              style={{ height: 36, padding: '0 16px', borderRadius: 8, border: 'none', background: 'rgba(230,0,126,0.08)', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 700, fontFamily: 'inherit', color: 'var(--primary, #e6007e)', display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0, transition: 'all 0.2s' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>filter_alt_off</span>
              Limpar filtros
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
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 20 }}>
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
                <div key={kpi.label} style={{ ...cardS, padding: '16px', display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: 12,
                    background: `${kpi.color}12`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 22, color: kpi.color }}>{kpi.icon}</span>
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>{kpi.label}</div>
                    <div style={{ fontSize: '1.2rem', fontWeight: 900, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{kpi.value}</div>
                  </div>
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
                          borderLeft: `3px solid ${stage?.color || '#6366f1'}`,
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                            <span style={{ fontSize: '0.85rem', fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {lead.name || 'Sem nome'}
                            </span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                              {stage && (
                                <span style={{
                                  padding: '2px 8px', borderRadius: 6, fontSize: '0.62rem', fontWeight: 800,
                                  background: `${stage.color}14`, color: stage.color,
                                }}>{stage.label}</span>
                              )}
                              <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                                {time.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                              </span>
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: 8, fontSize: '0.68rem', color: 'var(--text-muted)', flexWrap: 'wrap' }}>
                            {lead.campaignName && <span>📢 {lead.campaignName}</span>}
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
    </AuthGuard>
  )
}
