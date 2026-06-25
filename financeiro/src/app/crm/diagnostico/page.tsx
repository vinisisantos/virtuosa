'use client'

import { useState, useEffect, useCallback } from 'react'
import AuthGuard from '@/components/auth-guard'

interface InstanceInfo {
  id: string
  name: string
  unit: string | null
  status: string
  phoneNumber: string | null
  ownerName: string | null
}

interface LeadRow {
  contactName: string | null
  phone: string | null
  contactCreatedAt: string
  hasInbound: boolean
  instanceName: string | null
  instanceUnit: string | null
  instanceOwner: string | null
  hasClient: boolean
  client: {
    name: string; unit: string | null; source: string | null
    campaignName: string | null; stage: string | null; isActive: boolean
  } | null
  hasPipeline: boolean
  pipeline: { stage: string; unit: string | null; assignedName: string | null } | null
  flags: {
    noClient: boolean; syncedContactNoMsg: boolean; nameDiverges: boolean
    unitDiverges: boolean; inactiveClient: boolean; noPipeline: boolean
  }
}

interface DiagData {
  instances: InstanceInfo[]
  summary: {
    totalContacts: number; realLeads: number; withoutClient: number
    syncedNoMsg: number; nameDiverges: number
    unitDiverges: number; inactiveClients: number
    clientUnitDistribution: Record<string, number>
  }
  tableUnitDistribution: Record<string, Record<string, number>>
  leads: LeadRow[]
}

const cardS: React.CSSProperties = {
  background: 'var(--card-bg)', borderRadius: 14, border: '1px solid var(--border)', padding: 16,
}

function Badge({ text, color }: { text: string; color: string }) {
  return (
    <span style={{
      padding: '2px 7px', borderRadius: 6, fontSize: '0.6rem', fontWeight: 800,
      background: `${color}1a`, color, whiteSpace: 'nowrap',
    }}>{text}</span>
  )
}

function DiagnosticoInner() {
  const [data, setData] = useState<DiagData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/crm/diagnostico-leads?limit=80')
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'Erro') }
      setData(await res.json())
    } catch (e) { setError(e instanceof Error ? e.message : 'Erro') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const [savingInstance, setSavingInstance] = useState<string | null>(null)
  const setInstanceUnit = async (id: string, unit: string) => {
    if (!unit) return
    setSavingInstance(id)
    try {
      const res = await fetch('/api/whatsapp/admin/instances', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, unit }),
      })
      if (!res.ok) { const e = await res.json().catch(() => ({})); alert(e.error || 'Falha ao salvar') }
      await load()
    } catch { alert('Falha ao salvar') }
    finally { setSavingInstance(null) }
  }

  const q = search.trim().toLowerCase()
  const leads = (data?.leads || []).filter(l =>
    !q ||
    (l.contactName || '').toLowerCase().includes(q) ||
    (l.client?.name || '').toLowerCase().includes(q) ||
    (l.phone || '').includes(q)
  )

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '16px 16px 48px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 900 }}>🔬 Diagnóstico de Leads</h1>
          <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            Raio-x só-leitura: cada contato do WhatsApp × a pessoa (Client) e o negócio que gerou. Nenhum dado é alterado.
          </p>
        </div>
        <button onClick={load} style={{
          padding: '8px 16px', borderRadius: 10, border: 'none', cursor: 'pointer',
          background: 'linear-gradient(135deg, var(--primary), #ff4db1)', color: '#fff',
          fontWeight: 700, fontSize: '0.8rem', fontFamily: 'inherit',
        }}>↻ Atualizar</button>
      </div>

      {loading ? (
        <div style={{ ...cardS, textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>Carregando…</div>
      ) : error ? (
        <div style={{ ...cardS, color: '#ef4444' }}>Erro: {error}</div>
      ) : data ? (
        <>
          {/* Instâncias */}
          <div style={{ ...cardS, marginBottom: 14 }}>
            <h3 style={{ margin: '0 0 4px', fontSize: '0.9rem', fontWeight: 800 }}>Instâncias de WhatsApp</h3>
            <p style={{ margin: '0 0 10px', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
              A unidade definida aqui é onde <b>todo lead que cair nesse WhatsApp</b> será registrado.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {data.instances.map((i, idx) => {
                const valid = !!i.unit && ['Osasco', 'SBC', 'SCS', 'Todas'].includes(i.unit)
                return (
                  <div key={i.id} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', fontSize: '0.76rem', padding: '8px 0', borderBottom: idx < data.instances.length - 1 ? '1px solid var(--border)' : 'none' }}>
                    <span style={{ fontWeight: 700, minWidth: 120 }}>{i.name}</span>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--text-muted)' }}>
                      Registrar em:
                      <select
                        value={valid ? (i.unit as string) : ''}
                        disabled={savingInstance === i.id}
                        onChange={e => setInstanceUnit(i.id, e.target.value)}
                        style={{ height: 28, padding: '0 8px', borderRadius: 7, border: `1.5px solid ${valid ? 'var(--border)' : '#ef4444'}`, background: 'var(--bg)', color: 'var(--text-main)', fontSize: '0.76rem', fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' }}
                      >
                        <option value="" disabled>Definir unidade…</option>
                        <option value="Osasco">Osasco</option>
                        <option value="SBC">SBC</option>
                        <option value="SCS">SCS</option>
                        <option value="Todas">Todas as unidades (compartilhado)</option>
                      </select>
                    </label>
                    {savingInstance === i.id && <span style={{ color: 'var(--text-muted)' }}>⏳</span>}
                    {!valid && <Badge text="⚠️ defina a unidade" color="#ef4444" />}
                    {i.unit === 'Todas' && <Badge text="🌐 compartilhado" color="#8b5cf6" />}
                    <Badge text={i.status} color={i.status === 'connected' ? '#10b981' : '#94a3b8'} />
                    <span style={{ color: 'var(--text-muted)' }}>dono: {i.ownerName || '—'}</span>
                    {i.phoneNumber && <span style={{ color: 'var(--text-muted)' }}>· {i.phoneNumber}</span>}
                  </div>
                )
              })}
              {data.instances.length === 0 && <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Nenhuma instância.</span>}
            </div>
          </div>

          {/* Resumo */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 14 }}>
            {[
              { label: 'Contatos analisados', value: data.summary.totalContacts, color: '#6366f1' },
              { label: 'Leads reais (c/ msg)', value: data.summary.realLeads, color: '#8b5cf6' },
              { label: 'Lead SEM pessoa', value: data.summary.withoutClient, color: '#ef4444' },
              { label: 'Contato sem msg', value: data.summary.syncedNoMsg, color: '#94a3b8' },
              { label: 'Unidade diverge', value: data.summary.unitDiverges, color: '#f59e0b' },
            ].map(k => (
              <div key={k.label} style={{ ...cardS, padding: 12 }}>
                <div style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.4 }}>{k.label}</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 900, color: k.color }}>{k.value}</div>
              </div>
            ))}
          </div>

          {/* Distribuição por unidade */}
          <div style={{ ...cardS, marginBottom: 14 }}>
            <h3 style={{ margin: '0 0 8px', fontSize: '0.85rem', fontWeight: 800 }}>Distribuição das pessoas por unidade</h3>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {Object.entries(data.summary.clientUnitDistribution).map(([u, n]) => (
                <Badge key={u} text={`${u}: ${n}`} color={u === '(sem cliente)' ? '#ef4444' : '#6366f1'} />
              ))}
            </div>
          </div>

          {/* Distribuição por unidade em TODAS as tabelas (dimensiona migração Barueri) */}
          <div style={{ ...cardS, marginBottom: 14, overflowX: 'auto' }}>
            <h3 style={{ margin: '0 0 8px', fontSize: '0.85rem', fontWeight: 800 }}>Registros por unidade (todas as tabelas)</h3>
            <p style={{ margin: '0 0 10px', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
              Tudo em <b style={{ color: '#ef4444' }}>Barueri</b> está invisível no seletor atual. Use isto para decidir a migração.
            </p>
            {(() => {
              const dist = data.tableUnitDistribution || {}
              const rank = (u: string) => (u === 'Barueri' ? 0 : u === 'Total' ? 9 : 5)
              const allUnits = Array.from(new Set(
                Object.values(dist).flatMap(d => Object.keys(d))
              )).sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
              return (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.74rem' }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', padding: '4px 8px', color: 'var(--text-muted)' }}>Tabela</th>
                      {allUnits.map(u => (
                        <th key={u} style={{ textAlign: 'right', padding: '4px 8px', color: u === 'Barueri' ? '#ef4444' : 'var(--text-muted)', fontWeight: 800 }}>{u}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(dist).map(([table, d]) => (
                      <tr key={table} style={{ borderTop: '1px solid var(--border)' }}>
                        <td style={{ padding: '5px 8px', fontWeight: 700 }}>{table}</td>
                        {allUnits.map(u => (
                          <td key={u} style={{ textAlign: 'right', padding: '5px 8px', color: u === 'Barueri' && d[u] ? '#ef4444' : 'var(--text-main)', fontWeight: u === 'Barueri' && d[u] ? 800 : 500 }}>
                            {d[u] || '—'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            })()}
          </div>

          {/* Busca */}
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nome ou telefone (ex.: Vania, Isabel)…"
            style={{
              width: '100%', height: 42, padding: '0 14px', borderRadius: 10,
              border: '1.5px solid var(--border)', background: 'var(--bg)', color: 'var(--text-main)',
              fontSize: '0.85rem', fontFamily: 'inherit', outline: 'none', marginBottom: 12, boxSizing: 'border-box',
            }}
          />

          {/* Leads */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {leads.map((l, idx) => (
              <div key={idx} style={{ ...cardS, padding: 12, borderColor: l.flags.noClient ? 'rgba(239,68,68,0.4)' : 'var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                  <div style={{ fontWeight: 800, fontSize: '0.9rem' }}>
                    {l.contactName || 'Sem nome'} <span style={{ color: 'var(--text-muted)', fontWeight: 500, fontSize: '0.78rem' }}>· {l.phone}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                    {l.flags.noClient && <Badge text="LEAD SEM PESSOA" color="#ef4444" />}
                    {l.flags.syncedContactNoMsg && <Badge text="contato s/ msg" color="#94a3b8" />}
                    {l.flags.nameDiverges && <Badge text="NOME DIVERGE" color="#f59e0b" />}
                    {l.flags.unitDiverges && <Badge text="UNIDADE DIVERGE" color="#f59e0b" />}
                    {l.flags.inactiveClient && <Badge text="INATIVO" color="#94a3b8" />}
                    {l.flags.noPipeline && <Badge text="SEM PIPELINE" color="#94a3b8" />}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 8, fontSize: '0.74rem' }}>
                  <div style={{ color: 'var(--text-muted)' }}>
                    <b style={{ color: 'var(--text-main)' }}>Inbox/Instância:</b> {l.instanceName || '—'} · unidade <b style={{ color: l.instanceUnit ? 'var(--text-main)' : '#ef4444' }}>{l.instanceUnit || 'NENHUMA'}</b> · {l.instanceOwner || '—'}
                  </div>
                  {l.client ? (
                    <div style={{ color: 'var(--text-muted)' }}>
                      <b style={{ color: 'var(--text-main)' }}>Pessoa (Client):</b> "{l.client.name}" · unidade <b style={{ color: 'var(--text-main)' }}>{l.client.unit || '—'}</b> · {l.client.source || '—'} · {l.client.stage || '—'}
                      {l.client.campaignName && <> · 📢 {l.client.campaignName}</>}
                    </div>
                  ) : l.hasInbound ? (
                    <div style={{ color: '#ef4444', fontWeight: 700 }}>⚠️ Mandou mensagem mas NÃO virou pessoa (Client)</div>
                  ) : (
                    <div style={{ color: 'var(--text-muted)' }}>Contato sincronizado — nunca mandou mensagem (não é lead)</div>
                  )}
                  {l.pipeline && (
                    <div style={{ color: 'var(--text-muted)' }}>
                      <b style={{ color: 'var(--text-main)' }}>Pipeline:</b> {l.pipeline.stage} · {l.pipeline.unit || '—'} · {l.pipeline.assignedName || 'sem atendente'}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {leads.length === 0 && (
              <div style={{ ...cardS, textAlign: 'center', color: 'var(--text-muted)' }}>Nenhum contato encontrado para "{search}".</div>
            )}
          </div>
        </>
      ) : null}
    </div>
  )
}

export default function DiagnosticoPage() {
  return (
    <AuthGuard allowedRoles={['ADMINISTRADOR']}>
      <DiagnosticoInner />
    </AuthGuard>
  )
}
