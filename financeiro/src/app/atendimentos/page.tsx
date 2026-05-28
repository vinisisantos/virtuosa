'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { AppHeader } from '@/components/app-header'
import AuthGuard from '@/components/auth-guard'
import { useGlobalUnit } from '@/contexts/UnitContext'
import { toast } from '@/components/toast'
import NovoAtendimentoModal from '@/components/atendimentos/novo-atendimento-modal'

// ─── Tipos ────────────────────────────────────────────────────────────────────

type StatusAtendimento =
  | 'rascunho'
  | 'finalizado'
  | 'finalizado_automaticamente'

interface Atendimento {
  id:               string
  clientName:       string
  profissionalName: string | null
  unit:             string
  status:           StatusAtendimento
  createdAt:        string
  updatedAt:        string
}

interface FetchResult {
  atendimentos: Atendimento[]
  total:        number
  page:         number
  limit:        number
}

// ─── Badge de status ──────────────────────────────────────────────────────────

const STATUS_MAP: Record<StatusAtendimento, { label: string; color: string; bg: string; border: string }> = {
  rascunho: {
    label:  'Rascunho',
    color:  '#b45309',
    bg:     'rgba(245,158,11,0.1)',
    border: 'rgba(245,158,11,0.25)',
  },
  finalizado: {
    label:  'Finalizado',
    color:  '#047857',
    bg:     'rgba(16,185,129,0.1)',
    border: 'rgba(16,185,129,0.25)',
  },
  finalizado_automaticamente: {
    label:  'Finalizado auto.',
    color:  '#7c3aed',
    bg:     'rgba(139,92,246,0.1)',
    border: 'rgba(139,92,246,0.25)',
  },
}

function StatusBadge({ status }: { status: StatusAtendimento }) {
  const cfg = STATUS_MAP[status] ?? STATUS_MAP['rascunho']
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '3px 10px',
        borderRadius: 8,
        fontSize: '0.7rem',
        fontWeight: 700,
        color: cfg.color,
        background: cfg.bg,
        border: `1px solid ${cfg.border}`,
        whiteSpace: 'nowrap',
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: cfg.color,
          flexShrink: 0,
        }}
      />
      {cfg.label}
    </span>
  )
}

// ─── Formatação de data ───────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', {
    day:   '2-digit',
    month: '2-digit',
    year:  'numeric',
  })
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function AtendimentosPage() {
  const router = useRouter()
  const { globalUnit } = useGlobalUnit()

  const [atendimentos, setAtendimentos] = useState<Atendimento[]>([])
  const [total,        setTotal]        = useState(0)
  const [page,         setPage]         = useState(1)
  const [loading,      setLoading]      = useState(true)
  const [isModalOpen,  setIsModalOpen]  = useState(false)
  const [fabOpen,      setFabOpen]      = useState(false)
  const [hoveredRow,   setHoveredRow]   = useState<string | null>(null)

  const limit = 25

  // ── Busca atendimentos ──────────────────────────────────────────────────────

  const fetchAtendimentos = useCallback(async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams({
        page:  String(page),
        limit: String(limit),
      })

      if (globalUnit) params.set('unit', globalUnit)

      const res  = await fetch(`/api/atendimentos?${params.toString()}`)
      const data: FetchResult = await res.json()

      setAtendimentos(data.atendimentos || [])
      setTotal(data.total || 0)
    } catch (err) {
      console.error('Erro ao buscar atendimentos:', err)
      toast('Erro ao buscar atendimentos', 'error')
    } finally {
      setLoading(false)
    }
  }, [page, globalUnit])

  useEffect(() => { fetchAtendimentos() }, [fetchAtendimentos])

  // ── Paginação ───────────────────────────────────────────────────────────────

  const totalPages = Math.max(1, Math.ceil(total / limit))

  // ── Styles ──────────────────────────────────────────────────────────────────

  const thStyle: React.CSSProperties = {
    padding: '12px 20px',
    textAlign: 'left',
    fontSize: '0.72rem',
    fontWeight: 700,
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    borderBottom: '1px solid var(--border)',
    whiteSpace: 'nowrap',
  }

  const tdStyle: React.CSSProperties = {
    padding: '14px 20px',
    fontSize: '0.85rem',
    fontWeight: 600,
    color: 'var(--text-main)',
    whiteSpace: 'nowrap',
    borderBottom: '1px solid var(--border)',
  }

  const paginationBtnStyle = (disabled: boolean): React.CSSProperties => ({
    width: 36,
    height: 36,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    border: '1px solid var(--border)',
    background: 'var(--bg)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.35 : 1,
    color: 'var(--text-muted)',
    transition: 'all 0.15s',
  })

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <AuthGuard requiredPermission="dashboard">
      <AppHeader activePage="atendimentos" />
      <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200" rel="stylesheet" />

      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '20px 20px', minHeight: 'calc(100vh - 70px)' }}>

        {/* Page Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--primary)' }}>clinical_notes</span>
              Atendimentos
            </h1>
            {!loading && (
              <p style={{ margin: '2px 0 0', fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                {total} {total === 1 ? 'registro' : 'registros'}
              </p>
            )}
          </div>
          <button
            onClick={() => {
              toast('Exportando dados...', 'info')
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 16px',
              borderRadius: 10,
              border: '1px solid var(--border)',
              background: 'var(--card-bg)',
              color: 'var(--text-muted)',
              fontSize: '0.82rem',
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: 'inherit',
              transition: 'all 0.15s',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>download</span>
            Exportar
          </button>
        </div>

        {/* Card: Table */}
        <div
          style={{
            background: 'var(--card-bg)',
            borderRadius: 16,
            border: '1px solid var(--border)',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            overflow: 'hidden',
          }}
        >

          {/* Filter Bar */}
          <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)' }}>
            <button
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                background: 'none',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                fontSize: '0.82rem',
                fontWeight: 700,
                color: 'var(--primary)',
                fontFamily: 'inherit',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span>
              Adicionar filtro
            </button>
          </div>

          {/* Table */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={thStyle}>Data</th>
                  <th style={thStyle}>Paciente</th>
                  <th style={thStyle}>Profissional</th>
                  <th style={thStyle}>Fichas de atendimento</th>
                  <th style={thStyle}>Status</th>
                  <th style={{ ...thStyle, width: 48 }} />
                </tr>
              </thead>
              <tbody>

                {/* Loading skeleton */}
                {loading &&
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={`skel-${i}`}>
                      {Array.from({ length: 6 }).map((_, j) => (
                        <td key={j} style={{ ...tdStyle }}>
                          <div
                            style={{
                              height: 14,
                              width: j === 4 ? 100 : 80,
                              borderRadius: 6,
                              background: 'var(--border)',
                              animation: 'pulse 1.5s ease-in-out infinite',
                            }}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}

                {/* Empty state */}
                {!loading && atendimentos.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ padding: '60px 20px', textAlign: 'center', borderBottom: 'none' }}>
                      <span
                        className="material-symbols-outlined"
                        style={{ fontSize: 48, color: 'var(--text-muted)', opacity: 0.3, display: 'block', marginBottom: 10 }}
                      >
                        event_busy
                      </span>
                      <div style={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4 }}>
                        Nenhum atendimento encontrado
                      </div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', opacity: 0.7 }}>
                        Crie um novo atendimento clicando no botão abaixo.
                      </div>
                    </td>
                  </tr>
                )}

                {/* Data rows */}
                {!loading && atendimentos.map(atd => (
                  <tr
                    key={atd.id}
                    onClick={() => router.push(`/atendimentos/${atd.id}`)}
                    onMouseEnter={() => setHoveredRow(atd.id)}
                    onMouseLeave={() => setHoveredRow(null)}
                    style={{
                      cursor: 'pointer',
                      background: hoveredRow === atd.id ? 'var(--bg)' : 'transparent',
                      transition: 'background 0.15s',
                    }}
                  >
                    <td style={{ ...tdStyle, color: 'var(--text-muted)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'var(--text-muted)', opacity: 0.5 }}>calendar_today</span>
                        {formatDate(atd.createdAt)}
                      </div>
                    </td>
                    <td style={{ ...tdStyle, fontWeight: 800 }}>
                      {atd.clientName}
                    </td>
                    <td style={{ ...tdStyle, color: 'var(--text-muted)' }}>
                      {atd.profissionalName ?? '—'}
                    </td>
                    <td style={{ ...tdStyle, color: 'var(--text-muted)' }}>
                      Corporal
                    </td>
                    <td style={{ ...tdStyle }}>
                      <StatusBadge status={atd.status} />
                    </td>
                    <td
                      style={{ ...tdStyle, textAlign: 'center' }}
                      onClick={e => e.stopPropagation()}
                    >
                      <button
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          padding: 4,
                          borderRadius: 8,
                          color: 'var(--text-muted)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'background 0.15s',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg)' }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>more_vert</span>
                      </button>
                    </td>
                  </tr>
                ))}

              </tbody>
            </table>
          </div>

          {/* Pagination Footer */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '14px 20px',
              borderTop: '1px solid var(--border)',
            }}
          >
            <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)' }}>
              {limit} por página
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              {/* First page */}
              <button
                onClick={() => setPage(1)}
                disabled={page === 1}
                style={paginationBtnStyle(page === 1)}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>first_page</span>
              </button>
              {/* Previous */}
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                style={paginationBtnStyle(page === 1)}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>chevron_left</span>
              </button>
              {/* Current page */}
              <span
                style={{
                  width: 36,
                  height: 36,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 10,
                  background: 'linear-gradient(135deg, var(--primary), #ff4db1)',
                  color: '#fff',
                  fontSize: '0.82rem',
                  fontWeight: 800,
                }}
              >
                {page}
              </span>
              {/* Next */}
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                style={paginationBtnStyle(page === totalPages)}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>chevron_right</span>
              </button>
              {/* Last page */}
              <button
                onClick={() => setPage(totalPages)}
                disabled={page === totalPages}
                style={paginationBtnStyle(page === totalPages)}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>last_page</span>
              </button>
            </div>
          </div>

        </div>
      </div>

      {/* FAB — botão flutuante */}
      <div
        style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          gap: 10,
          zIndex: 50,
        }}
      >

        {/* Expanded option: Criar atendimento */}
        {fabOpen && (
          <button
            onClick={() => { setIsModalOpen(true); setFabOpen(false) }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 18px',
              borderRadius: 14,
              border: '1px solid var(--border)',
              background: 'var(--card-bg)',
              boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
              fontSize: '0.85rem',
              fontWeight: 700,
              color: 'var(--text-main)',
              cursor: 'pointer',
              fontFamily: 'inherit',
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--primary)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--primary)' }}>person_add</span>
            Criar atendimento
          </button>
        )}

        {/* Main FAB button */}
        <button
          onClick={() => setFabOpen(o => !o)}
          style={{
            width: 56,
            height: 56,
            borderRadius: 16,
            border: 'none',
            background: 'linear-gradient(135deg, var(--primary), #ff4db1)',
            color: '#fff',
            boxShadow: '0 8px 24px rgba(230,0,160,0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
        >
          <span
            className="material-symbols-outlined"
            style={{
              fontSize: 26,
              transition: 'transform 0.2s',
              transform: fabOpen ? 'rotate(45deg)' : 'rotate(0deg)',
            }}
          >
            add
          </span>
        </button>

      </div>

      {/* Modal de novo atendimento */}
      <NovoAtendimentoModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />

      <style jsx global>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </AuthGuard>
  )
}
