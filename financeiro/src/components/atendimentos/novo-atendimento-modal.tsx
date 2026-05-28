'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useGlobalUnit } from '@/contexts/UnitContext'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Client {
  id:   string
  name: string
  unit: string
}

interface Props {
  isOpen:  boolean
  onClose: () => void
}

// ─── Avatar colorido por inicial ──────────────────────────────────────────────

function getColor(name: string): string {
  const colors = ['#6366f1', '#10b981', '#f59e0b', '#e600a0', '#ef4444', '#8b5cf6', '#14b8a6', '#f97316']
  let hash = 0
  for (const c of name) hash = c.charCodeAt(0) + ((hash << 5) - hash)
  return colors[Math.abs(hash) % colors.length]
}

function getInitials(name: string): string {
  return name.trim().split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase()
}

// ─── Modal ────────────────────────────────────────────────────────────────────

export default function NovoAtendimentoModal({ isOpen, onClose }: Props) {
  const router = useRouter()
  const { globalUnit } = useGlobalUnit()

  const [clients,        setClients]        = useState<Client[]>([])
  const [search,         setSearch]         = useState('')
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [dropdownOpen,   setDropdownOpen]   = useState(false)
  const [loadingClients, setLoadingClients] = useState(false)
  const [creating,       setCreating]       = useState(false)

  const dropdownRef = useRef<HTMLDivElement>(null)
  const searchRef   = useRef<HTMLInputElement>(null)

  // ── Carrega clientes quando o modal abre ───────────────────────────────────

  useEffect(() => {
    if (!isOpen) {
      setSearch('')
      setSelectedClient(null)
      setDropdownOpen(false)
      return
    }

    async function fetchClients() {
      setLoadingClients(true)
      try {
        const params = new URLSearchParams({ limit: '200', orderBy: 'name' })
        if (globalUnit) params.set('unit', globalUnit)

        const res  = await fetch(`/api/clients?${params}`)
        const data = await res.json()
        setClients(Array.isArray(data) ? data : (data.clients ?? []))
      } catch (err) {
        console.error('Erro ao buscar clientes:', err)
      } finally {
        setLoadingClients(false)
      }
    }

    fetchClients()
  }, [isOpen, globalUnit])

  // ── Foca no input quando o dropdown abre ──────────────────────────────────

  useEffect(() => {
    if (dropdownOpen) {
      setTimeout(() => searchRef.current?.focus(), 50)
    }
  }, [dropdownOpen])

  // ── Fecha dropdown ao clicar fora ─────────────────────────────────────────

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // ── Cria atendimento ──────────────────────────────────────────────────────

  async function handleCreate() {
    if (!selectedClient) return
    setCreating(true)
    try {
      const unit = globalUnit || selectedClient.unit

      const res = await fetch('/api/atendimentos', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          clientId:   selectedClient.id,
          clientName: selectedClient.name,
          unit,
        }),
      })

      if (!res.ok) throw new Error('Erro ao criar atendimento')

      const atendimento = await res.json()
      onClose()
      router.push(`/atendimentos/${atendimento.id}`)
    } catch (err) {
      console.error(err)
    } finally {
      setCreating(false)
    }
  }

  // ── Filtra clientes pelo search ────────────────────────────────────────────

  const filtered = clients.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase())
  )

  if (!isOpen) return null

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: 20 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ background: 'var(--card-bg)', borderRadius: 24, width: '100%', maxWidth: 460, border: '1px solid var(--border)', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>

        {/* Cabeçalho */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid var(--border)', borderRadius: '24px 24px 0 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 22, color: 'var(--primary)' }}>clinical_notes</span>
            <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 900 }}>Novo atendimento</h2>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>close</span>
          </button>
        </div>

        {/* Corpo */}
        <div style={{ padding: '24px 24px 16px' }}>

          {/* Label */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>
              Paciente
            </label>
            <button style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
              + Adicionar
            </button>
          </div>

          {/* Dropdown de seleção */}
          <div style={{ position: 'relative' }} ref={dropdownRef}>
            <button
              onClick={() => setDropdownOpen(o => !o)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 16px', borderRadius: 12,
                border: dropdownOpen ? '2px solid var(--primary)' : '1px solid var(--border)',
                boxShadow: dropdownOpen ? '0 0 0 3px rgba(230,0,126,0.1)' : 'none',
                fontSize: '0.9rem', background: 'var(--bg)', cursor: 'pointer', fontFamily: 'inherit',
                fontWeight: 600, color: 'var(--text-main)', transition: 'all 0.2s',
              }}
            >
              {selectedClient ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: 8,
                    background: `linear-gradient(135deg, ${getColor(selectedClient.name)}, ${getColor(selectedClient.name)}cc)`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#fff', fontWeight: 900, fontSize: '0.65rem',
                  }}>
                    {getInitials(selectedClient.name)}
                  </div>
                  <span style={{ fontWeight: 700 }}>{selectedClient.name}</span>
                </div>
              ) : (
                <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>Selecione</span>
              )}
              <span className="material-symbols-outlined" style={{
                fontSize: 18, color: 'var(--text-muted)',
                transition: 'transform 0.2s',
                transform: dropdownOpen ? 'rotate(180deg)' : 'none',
              }}>expand_more</span>
            </button>

            {/* Lista dropdown */}
            {dropdownOpen && (
              <div style={{
                position: 'absolute', top: '100%', left: -1, right: -1, marginTop: 4,
                background: 'var(--card-bg)', border: '1px solid var(--border)',
                borderRadius: 14, boxShadow: '0 12px 40px rgba(0,0,0,0.2)',
                zIndex: 10, overflow: 'hidden',
              }}>
                {/* Search input */}
                <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ position: 'relative' }}>
                    <span className="material-symbols-outlined" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 16, color: 'var(--text-muted)' }}>search</span>
                    <input
                      ref={searchRef}
                      type="text"
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      placeholder="Buscar paciente..."
                      style={{
                        width: '100%', padding: '10px 12px 10px 34px', borderRadius: 10,
                        border: '1px solid var(--border)', fontSize: '0.85rem',
                        outline: 'none', background: 'var(--bg)', color: 'var(--text-main)',
                        fontFamily: 'inherit', fontWeight: 500, boxSizing: 'border-box' as const,
                      }}
                    />
                  </div>
                </div>

                {/* Lista */}
                <div style={{ maxHeight: 240, overflowY: 'auto' }}>
                  {loadingClients && (
                    <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.82rem', fontWeight: 600 }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 16, animation: 'spin 1s linear infinite', verticalAlign: 'middle', marginRight: 6 }}>progress_activity</span>
                      Carregando...
                    </div>
                  )}

                  {!loadingClients && filtered.length === 0 && (
                    <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 20, opacity: 0.3, display: 'block', marginBottom: 4 }}>person_off</span>
                      Nenhum paciente encontrado.
                    </div>
                  )}

                  {!loadingClients && filtered.map(client => {
                    const color = getColor(client.name)
                    const isSelected = selectedClient?.id === client.id
                    return (
                      <div
                        key={client.id}
                        onClick={() => { setSelectedClient(client); setDropdownOpen(false); setSearch('') }}
                        style={{
                          padding: '10px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
                          borderBottom: '1px solid var(--border)',
                          background: isSelected ? 'var(--primary-light)' : 'transparent',
                          transition: 'background 0.1s',
                        }}
                        onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'rgba(99,102,241,0.04)' }}
                        onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent' }}
                      >
                        <div style={{
                          width: 32, height: 32, borderRadius: 8,
                          background: `linear-gradient(135deg, ${color}, ${color}cc)`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: '#fff', fontWeight: 900, fontSize: '0.65rem', flexShrink: 0,
                        }}>
                          {getInitials(client.name)}
                        </div>
                        <span style={{
                          flex: 1, fontSize: '0.85rem',
                          fontWeight: isSelected ? 800 : 600,
                          color: isSelected ? 'var(--primary)' : 'var(--text-main)',
                        }}>
                          {client.name}
                        </span>
                        {isSelected && (
                          <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--primary)' }}>check_circle</span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Rodapé */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, padding: '16px 24px', borderTop: '1px solid var(--border)', background: 'var(--bg)', borderRadius: '0 0 24px 24px' }}>
          <button
            onClick={onClose}
            style={{
              padding: '10px 18px', borderRadius: 12, border: '1px solid var(--border)',
              background: 'var(--card-bg)', color: 'var(--text-main)', fontWeight: 700,
              fontSize: '0.85rem', cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            Cancelar
          </button>
          <button
            onClick={handleCreate}
            disabled={!selectedClient || creating}
            style={{
              padding: '10px 20px', borderRadius: 12, border: 'none',
              background: !selectedClient || creating ? 'rgba(230,0,126,0.3)' : 'linear-gradient(135deg, var(--primary), #ff4db1)',
              color: '#fff', fontWeight: 700, fontSize: '0.85rem',
              cursor: !selectedClient || creating ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6,
              opacity: !selectedClient || creating ? 0.6 : 1,
            }}
          >
            {creating && (
              <span className="material-symbols-outlined" style={{ fontSize: 16, animation: 'spin 1s linear infinite' }}>progress_activity</span>
            )}
            {creating ? 'Criando...' : 'Criar atendimento'}
          </button>
        </div>

      </div>
    </div>
  )
}
