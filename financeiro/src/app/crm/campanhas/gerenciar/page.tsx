'use client'

import { useState, useEffect, useCallback } from 'react'
import { useGlobalUnit } from '@/contexts/UnitContext'
import AuthGuard from '@/components/auth-guard'
import { toast } from '@/components/toast'
import { ProcedureSelector, type CatalogService } from '@/components/procedure-selector'

type CampaignOfferItemForm = {
  serviceCatalogId: string
  procedureName: string
  includedSessions: number
}

interface Campaign {
  id: string
  name: string
  platform: string
  status: string
  objective: string | null
  budget: number | null
  startDate: string | null
  endDate: string | null
  unit: string
  notes: string | null
  createdBy: string | null
  createdAt: string
  updatedAt: string
  budgetGroup: {
    id: string
    name: string
    dailyBudget: number
    startDate: string
    endDate: string | null
  } | null
  offerItems: Array<CampaignOfferItemForm & { serviceCatalog?: { price: number } }>
}

interface BudgetGroup {
  id: string
  name: string
  platform: string
  unit: string
  dailyBudget: number
  rechargeAmount: number | null
  rechargeIntervalDays: number | null
  startDate: string
  endDate: string | null
  isActive: boolean
  campaigns: Array<{ id: string; name: string; status: string }>
}

const PLATFORMS = [
  { key: 'meta_ads',   label: 'Meta Ads',   icon: '📢', color: '#0668E1' },
  { key: 'google_ads', label: 'Google Ads',  icon: '🔍', color: '#4285F4' },
  { key: 'outro',      label: 'Outro',       icon: '📋', color: '#94a3b8' },
]

const STATUS_OPT = [
  { key: 'ativa',     label: 'Ativa',     color: '#10b981', icon: 'play_circle' },
  { key: 'pausada',   label: 'Pausada',   color: '#f59e0b', icon: 'pause_circle' },
  { key: 'encerrada', label: 'Encerrada', color: '#94a3b8', icon: 'stop_circle' },
]

const OBJECTIVES = [
  { key: 'leads',       label: 'Geração de Leads' },
  { key: 'trafego',     label: 'Tráfego' },
  { key: 'conversao',   label: 'Conversão' },
  { key: 'engajamento', label: 'Engajamento' },
  { key: 'alcance',     label: 'Alcance' },
]

const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

// Máscara de moeda brasileira: digita "3000" → exibe "30,00"
const maskBRL = (v: string): string => {
  const digits = v.replace(/\D/g, '')
  if (!digits) return ''
  const cents = parseInt(digits, 10)
  return (cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
const parseBRL = (v: string): number => {
  if (!v) return 0
  return parseFloat(v.replace(/\./g, '').replace(',', '.')) || 0
}

const cardS: React.CSSProperties = {
  background: 'var(--card-bg)', borderRadius: 16, border: '1px solid var(--border)',
  boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
}

const inputS: React.CSSProperties = {
  width: '100%', height: 44, padding: '0 14px', borderRadius: 10, border: '1.5px solid var(--border)',
  background: 'var(--bg)', color: 'var(--text-main)', fontSize: '0.85rem',
  fontFamily: 'inherit', outline: 'none', transition: 'border-color 0.2s',
  boxSizing: 'border-box' as const, WebkitAppearance: 'none' as const,
}

const labelS: React.CSSProperties = {
  display: 'block', fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)',
  textTransform: 'uppercase' as const, letterSpacing: '0.5px', marginBottom: 5,
}

const emptyForm = {
  name: '', platform: 'meta_ads', status: 'ativa', objective: '',
  budget: '', startDate: '', endDate: '', notes: '', allUnits: false,
  offerItems: [] as CampaignOfferItemForm[],
}

export default function GerenciarCampanhasPage() {
  const { globalUnit } = useGlobalUnit()
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Campaign | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [filterStatus, setFilterStatus] = useState('all')
  const [catalogServices, setCatalogServices] = useState<CatalogService[]>([])
  const [offerProcedureDraft, setOfferProcedureDraft] = useState('')
  const [budgetGroup, setBudgetGroup] = useState<BudgetGroup | null>(null)
  const [budgetGroupForm, setBudgetGroupForm] = useState({
    name: 'Meta', dailyBudget: '', rechargeAmount: '', rechargeIntervalDays: '2',
    startDate: '', endDate: '', campaignIds: [] as string[],
  })
  const [savingBudgetGroup, setSavingBudgetGroup] = useState(false)

  const fetchCampaigns = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (globalUnit) params.set('unit', globalUnit)
      if (filterStatus !== 'all') params.set('status', filterStatus)
      const res = await fetch(`/api/campaigns/manage?${params}`)
      const data = await res.json()
      setCampaigns(Array.isArray(data) ? data : [])
    } catch { setCampaigns([]) }
    finally { setLoading(false) }
  }, [globalUnit, filterStatus])

  useEffect(() => { fetchCampaigns() }, [fetchCampaigns])

  const fetchBudgetGroup = useCallback(async () => {
    if (!globalUnit) return
    try {
      const response = await fetch(`/api/campaign-budget-groups?unit=${encodeURIComponent(globalUnit)}`)
      const groups: BudgetGroup[] = await response.json()
      const group = Array.isArray(groups) ? groups.find(item => item.isActive) || groups[0] || null : null
      setBudgetGroup(group)
      setBudgetGroupForm(group ? {
        name: group.name,
        dailyBudget: group.dailyBudget.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        rechargeAmount: group.rechargeAmount?.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '',
        rechargeIntervalDays: group.rechargeIntervalDays ? String(group.rechargeIntervalDays) : '',
        startDate: group.startDate,
        endDate: group.endDate || '',
        campaignIds: group.campaigns.map(campaign => campaign.id),
      } : {
        name: `Meta ${globalUnit}`, dailyBudget: '', rechargeAmount: '', rechargeIntervalDays: '2',
        startDate: '', endDate: '', campaignIds: [],
      })
    } catch {
      setBudgetGroup(null)
    }
  }, [globalUnit])

  useEffect(() => { fetchBudgetGroup() }, [fetchBudgetGroup])

  const handleSaveBudgetGroup = async () => {
    if (!globalUnit || !budgetGroupForm.dailyBudget || !budgetGroupForm.startDate) {
      toast('Informe o orçamento diário e a data inicial', 'error')
      return
    }
    setSavingBudgetGroup(true)
    try {
      const response = await fetch('/api/campaign-budget-groups', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: budgetGroup?.id,
          name: budgetGroupForm.name,
          platform: 'meta_ads',
          unit: globalUnit,
          dailyBudget: parseBRL(budgetGroupForm.dailyBudget),
          rechargeAmount: budgetGroupForm.rechargeAmount ? parseBRL(budgetGroupForm.rechargeAmount) : null,
          rechargeIntervalDays: budgetGroupForm.rechargeIntervalDays ? Number(budgetGroupForm.rechargeIntervalDays) : null,
          startDate: budgetGroupForm.startDate,
          endDate: budgetGroupForm.endDate || null,
          campaignIds: budgetGroupForm.campaignIds,
        }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Erro ao salvar')
      toast('Orçamento compartilhado atualizado', 'success')
      await Promise.all([fetchBudgetGroup(), fetchCampaigns()])
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Erro ao salvar orçamento', 'error')
    } finally {
      setSavingBudgetGroup(false)
    }
  }

  useEffect(() => {
    if (!globalUnit) {
      setCatalogServices([])
      return
    }
    let cancelled = false
    fetch(`/api/catalog?unit=${encodeURIComponent(globalUnit)}`)
      .then(async response => {
        const data = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(data.error || 'Erro ao carregar catálogo')
        if (!cancelled) setCatalogServices(data.services || [])
      })
      .catch(() => { if (!cancelled) setCatalogServices([]) })
    return () => { cancelled = true }
  }, [globalUnit])

  const openNew = () => {
    setEditing(null)
    setForm(emptyForm)
    setOfferProcedureDraft('')
    setShowModal(true)
  }

  const openEdit = (c: Campaign) => {
    setEditing(c)
    setForm({
      name: c.name, platform: c.platform, status: c.status,
      objective: c.objective || '', budget: c.budget ? c.budget.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '',
      startDate: c.startDate || '', endDate: c.endDate || '',
      notes: c.notes || '', allUnits: false,
      offerItems: (c.offerItems || []).map(item => ({
        serviceCatalogId: item.serviceCatalogId,
        procedureName: item.procedureName,
        includedSessions: item.includedSessions,
      })),
    })
    setOfferProcedureDraft('')
    setShowModal(true)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) { toast('Nome é obrigatório', 'error'); return }
    setSaving(true)
    try {
      const payload = {
        ...form,
        unit: globalUnit || 'SCS',
        budget: form.budget ? parseBRL(form.budget) : null,
        objective: form.objective || null,
        notes: form.notes || null,
        allUnits: !editing && form.allUnits, // only on create
        ...(editing ? { id: editing.id } : {}),
      }
      const res = await fetch('/api/campaigns/manage', {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (res.ok) {
        if (!editing && form.allUnits) {
          toast('✅ Campanha registrada em todas as 3 unidades!', 'success')
        } else {
          toast(editing ? '✅ Campanha atualizada!' : '✅ Campanha registrada!', 'success')
        }
        setShowModal(false)
        fetchCampaigns()
      } else {
        const err = await res.json()
        toast(`❌ ${err.error}`, 'error')
      }
    } catch { toast('Erro ao salvar', 'error') }
    finally { setSaving(false) }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir esta campanha?')) return
    try {
      await fetch(`/api/campaigns/manage?id=${id}`, { method: 'DELETE' })
      toast('Campanha excluída', 'success')
      fetchCampaigns()
    } catch { toast('Erro ao excluir', 'error') }
  }

  const toggleStatus = async (c: Campaign) => {
    const nextStatus = c.status === 'ativa' ? 'pausada' : c.status === 'pausada' ? 'ativa' : c.status
    try {
      await fetch('/api/campaigns/manage', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: c.id, status: nextStatus }),
      })
      toast(`Campanha ${nextStatus === 'ativa' ? 'ativada' : 'pausada'}`, 'success')
      fetchCampaigns()
    } catch { toast('Erro', 'error') }
  }

  const counts = {
    all: campaigns.length,
    ativa: campaigns.filter(c => c.status === 'ativa').length,
    pausada: campaigns.filter(c => c.status === 'pausada').length,
    encerrada: campaigns.filter(c => c.status === 'encerrada').length,
  }

  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200" rel="stylesheet" />
      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '16px 20px 40px' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 24, color: 'var(--primary)' }}>edit_note</span>
              Gerenciar Campanhas
            </h1>
            <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              Registre os anúncios no ar para rastrear origem dos leads
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <a href="/crm/campanhas" style={{
              ...cardS, padding: '9px 16px', display: 'flex', alignItems: 'center', gap: 6,
              fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-main)', textDecoration: 'none',
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--primary)' }}>analytics</span>
              Dashboard
            </a>
            <button onClick={openNew} style={{
              padding: '9px 18px', borderRadius: 12, border: 'none', cursor: 'pointer',
              background: 'linear-gradient(135deg, var(--primary), #ff4db1)',
              color: '#fff', fontWeight: 700, fontSize: '0.82rem', fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span>
              Nova Campanha
            </button>
          </div>
        </div>

        <div style={{ ...cardS, padding: 18, marginBottom: 16, borderLeft: '3px solid #ec4899' }}>
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-sm font-black text-foreground">
                <span className="material-symbols-outlined text-[19px] text-pink-700 dark:text-pink-400">account_balance_wallet</span>
                Orçamento compartilhado da plataforma
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">
                O investimento é contado uma vez e rateado entre as campanhas conforme os leads do período.
              </div>
            </div>
            <button
              type="button"
              onClick={handleSaveBudgetGroup}
              disabled={savingBudgetGroup}
              className="rounded-lg bg-pink-500 px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
            >
              {savingBudgetGroup ? 'Salvando...' : 'Salvar orçamento'}
            </button>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
            <div>
              <label style={labelS}>Nome do grupo</label>
              <input style={inputS} value={budgetGroupForm.name} onChange={event => setBudgetGroupForm(current => ({ ...current, name: event.target.value }))} />
            </div>
            <div>
              <label style={labelS}>Orçamento diário (R$)</label>
              <input inputMode="numeric" style={inputS} value={budgetGroupForm.dailyBudget} onChange={event => setBudgetGroupForm(current => ({ ...current, dailyBudget: maskBRL(event.target.value) }))} placeholder="0,00" />
            </div>
            <div>
              <label style={labelS}>Recarga (R$)</label>
              <input inputMode="numeric" style={inputS} value={budgetGroupForm.rechargeAmount} onChange={event => setBudgetGroupForm(current => ({ ...current, rechargeAmount: maskBRL(event.target.value) }))} placeholder="0,00" />
            </div>
            <div>
              <label style={labelS}>Intervalo da recarga</label>
              <input type="number" min={1} style={inputS} value={budgetGroupForm.rechargeIntervalDays} onChange={event => setBudgetGroupForm(current => ({ ...current, rechargeIntervalDays: event.target.value }))} />
            </div>
            <div>
              <label style={labelS}>Data inicial</label>
              <input type="date" style={inputS} value={budgetGroupForm.startDate} onChange={event => setBudgetGroupForm(current => ({ ...current, startDate: event.target.value }))} />
            </div>
          </div>
          <div className="mt-4">
            <div style={labelS}>Campanhas incluídas</div>
            <div className="flex flex-wrap gap-2">
              {campaigns.filter(campaign => campaign.platform === 'meta_ads').map(campaign => {
                const selected = budgetGroupForm.campaignIds.includes(campaign.id)
                return (
                  <button
                    type="button"
                    key={campaign.id}
                    onClick={() => setBudgetGroupForm(current => ({
                      ...current,
                      campaignIds: selected
                        ? current.campaignIds.filter(id => id !== campaign.id)
                        : [...current.campaignIds, campaign.id],
                    }))}
                    className={`rounded-lg border px-3 py-2 text-xs font-bold ${selected ? 'border-pink-500 bg-pink-500/10 text-pink-700 dark:text-pink-400' : 'border-border text-muted-foreground'}`}
                  >
                    {selected ? '✓ ' : ''}{campaign.name} · {campaign.status}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* Status filters */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          {[
            { key: 'all', label: 'Todas', count: counts.all, color: '#6366f1' },
            { key: 'ativa', label: 'Ativas', count: counts.ativa, color: '#10b981' },
            { key: 'pausada', label: 'Pausadas', count: counts.pausada, color: '#f59e0b' },
            { key: 'encerrada', label: 'Encerradas', count: counts.encerrada, color: '#94a3b8' },
          ].map(f => (
            <button key={f.key} onClick={() => setFilterStatus(f.key)} style={{
              ...cardS, padding: '8px 14px', cursor: 'pointer', fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', fontWeight: 700,
              color: filterStatus === f.key ? f.color : 'var(--text-muted)',
              borderColor: filterStatus === f.key ? f.color : 'var(--border)',
              outline: filterStatus === f.key ? `2px solid ${f.color}` : 'none', outlineOffset: -2,
            }}>
              {f.label}
              <span style={{
                padding: '1px 6px', borderRadius: 5, fontSize: '0.65rem', fontWeight: 800,
                background: `${f.color}14`, color: f.color,
              }}>{f.count}</span>
            </button>
          ))}
        </div>

        {/* Campaign list */}
        {loading ? (
          <div style={{ ...cardS, textAlign: 'center', padding: '60px 20px' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 36, color: 'var(--primary)', opacity: 0.4 }}>progress_activity</span>
          </div>
        ) : campaigns.length === 0 ? (
          <div style={{ ...cardS, textAlign: 'center', padding: '60px 20px' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 52, color: 'var(--text-muted)', opacity: 0.12 }}>campaign</span>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: 10 }}>Nenhuma campanha registrada</p>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Clique em "Nova Campanha" para registrar um anúncio</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {campaigns.map(c => {
              const plat = PLATFORMS.find(p => p.key === c.platform) || PLATFORMS[2]
              const st = STATUS_OPT.find(s => s.key === c.status) || STATUS_OPT[0]
              const obj = OBJECTIVES.find(o => o.key === c.objective)
              return (
                <div key={c.id} style={{ ...cardS, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16 }}>
                  {/* Status indicator */}
                  <button onClick={() => toggleStatus(c)} title={c.status === 'ativa' ? 'Pausar' : 'Ativar'}
                    style={{
                      width: 40, height: 40, borderRadius: 12, border: 'none', cursor: c.status !== 'encerrada' ? 'pointer' : 'default',
                      background: `${st.color}14`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 22, color: st.color }}>{st.icon}</span>
                  </button>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 3 }}>
                      <span style={{ fontSize: '0.92rem', fontWeight: 800 }}>{c.name}</span>
                      <span style={{
                        padding: '2px 8px', borderRadius: 6, fontSize: '0.6rem', fontWeight: 700,
                        background: `${st.color}14`, color: st.color,
                      }}>{st.label}</span>
                      <span style={{
                        padding: '2px 8px', borderRadius: 6, fontSize: '0.6rem', fontWeight: 700,
                        background: `${plat.color}14`, color: plat.color,
                      }}>{plat.icon} {plat.label}</span>
                      <span style={{
                        padding: '2px 7px', borderRadius: 6, fontSize: '0.58rem', fontWeight: 700,
                        background: 'rgba(99,102,241,0.1)', color: '#818cf8',
                        display: 'flex', alignItems: 'center', gap: 3,
                      }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 10 }}>location_on</span>
                        {c.unit}
                      </span>
                      <span style={{
                        padding: '2px 7px', borderRadius: 6, fontSize: '0.58rem', fontWeight: 700,
                        background: c.offerItems?.length ? 'rgba(14,165,233,0.1)' : 'rgba(245,158,11,0.1)',
                        color: c.offerItems?.length ? '#38bdf8' : '#f59e0b',
                      }}>
                        {c.offerItems?.length ? `${c.offerItems.length} item(ns) na oferta` : 'Oferta não configurada'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 12, fontSize: '0.72rem', color: 'var(--text-muted)', flexWrap: 'wrap' }}>
                      {obj && <span>🎯 {obj.label}</span>}
                      {c.budgetGroup
                        ? <span>💰 {c.budgetGroup.name}: {fmt(c.budgetGroup.dailyBudget)}/dia compartilhado</span>
                        : c.budget && <span>💰 {fmt(c.budget)}/dia</span>}
                      {c.startDate && (() => {
                        const start = new Date(c.startDate);
                        const end = c.status === 'encerrada' && c.endDate ? new Date(c.endDate) : new Date();
                        const days = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86400000));
                        return (
                          <>
                            <span>📅 {days} {days === 1 ? 'dia' : 'dias'}</span>
                            {c.budget && <span style={{ color: '#f59e0b', fontWeight: 700 }}>≈ {fmt(c.budget * days)}</span>}
                          </>
                        );
                      })()}
                      {!c.startDate && c.budget && <span style={{ fontStyle: 'italic' }}>Informe data início p/ calcular custo</span>}
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                    <button onClick={() => openEdit(c)} title="Editar" style={{
                      width: 34, height: 34, borderRadius: 8, border: '1px solid var(--border)',
                      background: 'var(--bg)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--text-muted)' }}>edit</span>
                    </button>
                    <button onClick={() => handleDelete(c.id)} title="Excluir" style={{
                      width: 34, height: 34, borderRadius: 8, border: '1px solid var(--border)',
                      background: 'var(--bg)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#ef4444' }}>delete</span>
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Modal — Nova/Editar Campanha */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)' }}
          onClick={e => { if (e.target === e.currentTarget) setShowModal(false) }}>
          <div style={{ ...cardS, width: '100%', maxWidth: 680, maxHeight: '90vh', overflow: 'auto', padding: '28px 28px 24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{
                  width: 32, height: 32, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'linear-gradient(135deg, var(--primary), #ff4db1)',
                }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 17, color: '#fff' }}>
                    {editing ? 'edit' : 'add'}
                  </span>
                </span>
                {editing ? 'Editar Campanha' : 'Nova Campanha'}
              </h2>
              <button onClick={() => setShowModal(false)} style={{
                width: 32, height: 32, borderRadius: 8, border: '1px solid var(--border)',
                background: 'var(--bg)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--text-muted)' }}>close</span>
              </button>
            </div>

            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Nome */}
              <div>
                <label style={labelS}>Nome da Campanha *</label>
                <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                  style={{ ...inputS, height: 48, fontSize: '0.92rem', fontWeight: 600 }} placeholder="Ex: Corporal Verão 2026" autoFocus />
              </div>

              {/* Toggle: Todas as Unidades (só aparece ao criar) */}
              {!editing && (
                <button
                  type="button"
                  onClick={() => setForm(f => ({
                    ...f,
                    allUnits: !f.allUnits,
                    ...(!f.allUnits ? { offerItems: [] } : {}),
                  }))}
                  style={{
                    width: '100%', padding: '12px 16px', borderRadius: 12,
                    border: form.allUnits
                      ? '2px solid var(--primary, #e6007e)'
                      : '1.5px dashed var(--border)',
                    background: form.allUnits
                      ? 'linear-gradient(135deg, rgba(230,0,126,0.08), rgba(255,77,177,0.06))'
                      : 'transparent',
                    cursor: 'pointer', fontFamily: 'inherit',
                    display: 'flex', alignItems: 'center', gap: 12,
                    transition: 'all 0.25s',
                    boxShadow: form.allUnits ? '0 0 0 3px rgba(230,0,126,0.1)' : 'none',
                  }}
                >
                  {/* Icon */}
                  <div style={{
                    width: 38, height: 38, borderRadius: 10, flexShrink: 0,
                    background: form.allUnits
                      ? 'linear-gradient(135deg, var(--primary, #e6007e), #ff4db1)'
                      : 'var(--bg)',
                    border: form.allUnits ? 'none' : '1.5px solid var(--border)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'all 0.25s',
                  }}>
                    <span className="material-symbols-outlined" style={{
                      fontSize: 20,
                      color: form.allUnits ? '#fff' : 'var(--text-muted)',
                    }}>hub</span>
                  </div>

                  {/* Text */}
                  <div style={{ flex: 1, textAlign: 'left' }}>
                    <div style={{
                      fontSize: '0.82rem', fontWeight: 800,
                      color: form.allUnits ? 'var(--primary, #e6007e)' : 'var(--text-main)',
                      transition: 'color 0.2s',
                    }}>
                      Todas as Unidades
                    </div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 1 }}>
                      {form.allUnits
                        ? '✅ Será registrada em Osasco, SBC e SCS'
                        : 'Ativar para registrar em todas as 3 unidades ao mesmo tempo'
                      }
                    </div>
                  </div>

                  {/* Pill badges */}
                  {form.allUnits && (
                    <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                      {['OS', 'SB', 'SC'].map(u => (
                        <span key={u} style={{
                          padding: '2px 7px', borderRadius: 6,
                          background: 'rgba(230,0,126,0.12)',
                          color: 'var(--primary, #e6007e)',
                          fontSize: '0.6rem', fontWeight: 800,
                        }}>{u}</span>
                      ))}
                    </div>
                  )}

                  {/* Toggle pill */}
                  <div style={{
                    width: 42, height: 24, borderRadius: 12, flexShrink: 0,
                    background: form.allUnits ? 'var(--primary, #e6007e)' : 'var(--border)',
                    position: 'relative', transition: 'background 0.25s',
                  }}>
                    <div style={{
                      position: 'absolute', top: 3,
                      left: form.allUnits ? 21 : 3,
                      width: 18, height: 18, borderRadius: '50%',
                      background: '#fff',
                      boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
                      transition: 'left 0.25s',
                    }} />
                  </div>
                </button>
              )}

              {/* Plataforma + Status */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={labelS}>Plataforma</label>
                  <select value={form.platform} onChange={e => setForm({ ...form, platform: e.target.value })} style={inputS}>
                    {PLATFORMS.map(p => <option key={p.key} value={p.key}>{p.icon} {p.label}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelS}>Status</label>
                  <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} style={inputS}>
                    {STATUS_OPT.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                  </select>
                </div>
              </div>

              {/* Objetivo + Orçamento Diário */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={labelS}>Objetivo</label>
                  <select value={form.objective} onChange={e => setForm({ ...form, objective: e.target.value })} style={inputS}>
                    <option value="">Selecione</option>
                    {OBJECTIVES.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelS}>Orçamento Diário (R$)</label>
                  <input value={form.budget} onChange={e => setForm({ ...form, budget: maskBRL(e.target.value) })}
                    inputMode="numeric" style={inputS} placeholder="0,00" />
                </div>
              </div>

              {/* Data Início (para cálculo de custo) */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={labelS}>Data Início</label>
                  <input value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })}
                    type="date" style={inputS} />
                </div>
                <div>
                  <label style={labelS}>Data Fim <span style={{ fontWeight: 400, textTransform: 'none' as const }}>(opcional)</span></label>
                  <input value={form.endDate} onChange={e => setForm({ ...form, endDate: e.target.value })}
                    type="date" style={inputS} />
                </div>
              </div>

              {/* Custo estimado preview */}
              {form.budget && form.startDate && (() => {
                const start = new Date(form.startDate);
                const end = form.endDate ? new Date(form.endDate) : new Date();
                const days = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86400000));
                const total = parseBRL(form.budget) * days;
                return (
                  <div style={{
                    padding: '12px 16px', borderRadius: 10,
                    background: 'linear-gradient(135deg, rgba(245,158,11,0.08), rgba(16,185,129,0.08))',
                    border: '1px solid rgba(245,158,11,0.15)',
                    display: 'flex', alignItems: 'center', gap: 10,
                  }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#f59e0b' }}>calculate</span>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-main)' }}>
                      <span style={{ fontWeight: 600 }}>Custo estimado:</span>{' '}
                      <span style={{ fontWeight: 800, color: '#f59e0b' }}>{fmt(total)}</span>
                      <span style={{ color: 'var(--text-muted)', marginLeft: 6, fontSize: '0.7rem' }}>
                        ({fmt(parseBRL(form.budget))}/dia × {days} {days === 1 ? 'dia' : 'dias'}{!form.endDate ? ' até hoje' : ''})
                      </span>
                    </div>
                  </div>
                );
              })()}

              {/* Oferta anunciada */}
              <div style={{
                padding: 14, borderRadius: 12, border: '1px solid var(--border)',
                background: 'var(--bg)', display: 'flex', flexDirection: 'column', gap: 10,
              }}>
                <div>
                  <div style={{ fontSize: '0.78rem', fontWeight: 900 }}>Procedimentos incluídos no anúncio</div>
                  <div style={{ marginTop: 2, fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                    Esta composição será usada para separar itens incluídos, adicionais e sessões excedentes.
                  </div>
                </div>

                {form.allUnits ? (
                  <div style={{
                    padding: '10px 12px', borderRadius: 9, border: '1px solid rgba(245,158,11,0.25)',
                    background: 'rgba(245,158,11,0.08)', color: '#f59e0b', fontSize: '0.72rem', fontWeight: 700,
                  }}>
                    Crie a campanha nas unidades e depois configure a oferta individualmente em cada catálogo.
                  </div>
                ) : (
                  <>
                    {form.offerItems.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                        {form.offerItems.map((item, index) => (
                          <div key={item.serviceCatalogId} style={{
                            display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 92px 32px', gap: 8,
                            alignItems: 'center', padding: 9, borderRadius: 9, border: '1px solid var(--border)',
                            background: 'var(--card-bg)',
                          }}>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: '0.76rem', fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {item.procedureName}
                              </div>
                              <div style={{ marginTop: 2, fontSize: '0.62rem', color: 'var(--text-muted)' }}>Quantidade incluída</div>
                            </div>
                            <input
                              type="number"
                              min={1}
                              max={999}
                              value={item.includedSessions}
                              onChange={event => {
                                const includedSessions = Math.max(1, Math.min(999, Number(event.target.value) || 1))
                                setForm(current => ({
                                  ...current,
                                  offerItems: current.offerItems.map((candidate, itemIndex) =>
                                    itemIndex === index ? { ...candidate, includedSessions } : candidate),
                                }))
                              }}
                              aria-label={`Quantidade incluída de ${item.procedureName}`}
                              style={{ ...inputS, height: 38, padding: '0 9px' }}
                            />
                            <button
                              type="button"
                              onClick={() => setForm(current => ({
                                ...current,
                                offerItems: current.offerItems.filter((_, itemIndex) => itemIndex !== index),
                              }))}
                              aria-label={`Remover ${item.procedureName}`}
                              style={{
                                width: 32, height: 32, borderRadius: 8, border: '1px solid var(--border)',
                                background: 'transparent', color: '#ef4444', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                              }}
                            >
                              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>delete</span>
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    <ProcedureSelector
                      services={catalogServices.filter(service =>
                        !form.offerItems.some(item => item.serviceCatalogId === service.id))}
                      value={offerProcedureDraft}
                      onChange={(name, _price, service) => {
                        setOfferProcedureDraft(name)
                        if (!service) return
                        setForm(current => ({
                          ...current,
                          offerItems: [
                            ...current.offerItems,
                            { serviceCatalogId: service.id, procedureName: service.name, includedSessions: 1 },
                          ],
                        }))
                        setOfferProcedureDraft('')
                      }}
                      placeholder="Adicionar procedimento da oferta"
                    />
                  </>
                )}
              </div>

              {/* Observações */}
              <div>
                <label style={labelS}>Observações</label>
                <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
                  rows={2} style={{ ...inputS, height: 'auto', padding: '10px 14px', resize: 'vertical' }}
                  placeholder="Link do anúncio, público alvo, etc." />
              </div>

              {/* Submit */}
              <button type="submit" disabled={saving} style={{
                width: '100%', height: 48, borderRadius: 12, border: 'none',
                background: saving ? '#94a3b8' : 'linear-gradient(135deg, var(--primary), #ff4db1)',
                color: '#fff', fontWeight: 700, fontSize: '0.88rem', cursor: saving ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit', marginTop: 2,
                boxShadow: saving ? 'none' : '0 4px 14px rgba(230,0,160,0.25)',
              }}>
                {saving ? 'Salvando...' : editing ? 'Salvar Alterações' : 'Registrar Campanha'}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
