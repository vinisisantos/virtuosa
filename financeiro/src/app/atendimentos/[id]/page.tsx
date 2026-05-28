'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { AppHeader } from '@/components/app-header'
import AuthGuard from '@/components/auth-guard'
import { toast } from '@/components/toast'
import DistribuicaoGordura from '@/components/atendimentos/ficha-corporal/distribuicao-gordura'
import CalculoIMC          from '@/components/atendimentos/ficha-corporal/calculo-imc'
import Adipometria         from '@/components/atendimentos/ficha-corporal/adipometria'
import Perimetria          from '@/components/atendimentos/ficha-corporal/perimetria'
import GrauCelulite        from '@/components/atendimentos/ficha-corporal/grau-celulite'
import Estrias             from '@/components/atendimentos/ficha-corporal/estrias'
import TesteDiastase       from '@/components/atendimentos/ficha-corporal/teste-diastase'
import AparenciaCorporal   from '@/components/atendimentos/ficha-corporal/aparencia-corporal'

// ─── Tipos ────────────────────────────────────────────────────────────────────

type SaveStatus = 'idle' | 'saving' | 'saved'
type FichaKey   = 'anamnese' | 'capilar' | 'corporal' | 'epilacao' |
                  'facial'   | 'fotos'   | 'injetaveis' | 'orcamento' | 'plano'

interface Atendimento {
  id:               string
  clientId:         string
  clientName:       string
  profissionalName: string | null
  unit:             string
  status:           string
  timerSeconds:     number
  privacidade:      string
  fichaCorporal:    FichaCorporalData | null
}

export interface FichaCorporalData {
  id?:                  string
  distribuicaoGordura?: string | null
  peso?:                number | null
  altura?:              number | null
  imc?:                 number | null
  adipometriaProtocolo?: string | null
  adipometriaData?:     Record<string, unknown> | null
  percentualGordura?:   number | null
  perimetriaData?:      Record<string, unknown> | null
  grauCelulite?:        number | null
  tipoEstria?:          string | null
  observacoesEstria?:   string | null
  diasteseResultado?:   string | null
  diasteseTipo?:        string | null
  observacoesDiastese?: string | null
  aparenciaPercebida?:  number | null
  aparenciaDesejada?:   number | null
  observacoes?:         string | null
}

// ─── Lista de fichas disponíveis ──────────────────────────────────────────────

const FICHAS: { key: FichaKey; label: string; icon: string; available: boolean }[] = [
  { key: 'anamnese',    label: 'Anamnese',            icon: 'assignment',        available: false },
  { key: 'capilar',     label: 'Capilar',             icon: 'face',              available: false },
  { key: 'corporal',    label: 'Corporal',            icon: 'body_system',       available: true  },
  { key: 'epilacao',    label: 'Epilação',            icon: 'dermatology',       available: false },
  { key: 'facial',      label: 'Facial',              icon: 'sentiment_satisfied', available: false },
  { key: 'fotos',       label: 'Fotos e anexos',      icon: 'photo_library',     available: false },
  { key: 'injetaveis',  label: 'Injetáveis',          icon: 'syringe',           available: false },
  { key: 'orcamento',   label: 'Orçamento',           icon: 'request_quote',     available: false },
  { key: 'plano',       label: 'Plano de tratamento', icon: 'clinical_notes',    available: false },
]

// ─── Utilitários ──────────────────────────────────────────────────────────────

function formatTimer(s: number): string {
  const h   = Math.floor(s / 3600)
  const m   = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return [h, m, sec].map(n => String(n).padStart(2, '0')).join(':')
}

// ─── Badge de save ────────────────────────────────────────────────────────────

function SaveBadge({ status }: { status: SaveStatus }) {
  if (status === 'idle') return null

  if (status === 'saving') return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', color: 'var(--text-muted)' }}>
      <span className="material-symbols-outlined" style={{ fontSize: 14, animation: 'spin 1s linear infinite', color: 'var(--text-muted)' }}>progress_activity</span>
      Salvando...
    </span>
  )

  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', color: 'var(--text-muted)' }}>
      <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#10b981' }}>check_circle</span>
      Rascunho salvo
    </span>
  )
}

// ─── Página ───────────────────────────────────────────────────────────────────

export default function AtendimentoDetailPage() {
  const router = useRouter()
  const params = useParams()
  const id     = params.id as string

  const [atendimento,   setAtendimento]   = useState<Atendimento | null>(null)
  const [fichaCorporal, setFichaCorporal] = useState<FichaCorporalData>({})
  const [fichaAtiva,    setFichaAtiva]    = useState<FichaKey>('corporal')
  const [timerSeconds,  setTimerSeconds]  = useState(0)
  const [saveStatus,    setSaveStatus]    = useState<SaveStatus>('idle')
  const [privacidade,   setPrivacidade]   = useState<'privado' | 'compartilhado'>('privado')
  const [loading,       setLoading]       = useState(true)
  const [finalizando,   setFinalizando]   = useState(false)
  const [hoveredFicha,  setHoveredFicha]  = useState<FichaKey | null>(null)

  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout>  | null>(null)
  const timerSyncRef   = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Carrega atendimento ────────────────────────────────────────────────────

  useEffect(() => {
    async function load() {
      try {
        const res  = await fetch(`/api/atendimentos/${id}`)
        const data: Atendimento = await res.json()
        setAtendimento(data)
        setTimerSeconds(data.timerSeconds ?? 0)
        setPrivacidade((data.privacidade as 'privado' | 'compartilhado') ?? 'privado')
        if (data.fichaCorporal) setFichaCorporal(data.fichaCorporal)
      } catch (err) {
        console.error('Erro ao carregar atendimento:', err)
        toast('Erro ao carregar atendimento', 'error')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [id])

  // ── Timer — incrementa 1s por segundo ─────────────────────────────────────

  useEffect(() => {
    const interval = setInterval(() => setTimerSeconds(s => s + 1), 1000)
    return () => clearInterval(interval)
  }, [])

  // ── Sincroniza timer com a API a cada 30s ──────────────────────────────────

  useEffect(() => {
    timerSyncRef.current = setInterval(async () => {
      await fetch(`/api/atendimentos/${id}`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ timerSeconds }),
      })
    }, 30_000)
    return () => {
      if (timerSyncRef.current) clearInterval(timerSyncRef.current)
    }
  }, [id, timerSeconds])

  // ── Auto-save da ficha corporal (debounce 2s) ──────────────────────────────

  const autoSave = useCallback(async (data: FichaCorporalData) => {
    setSaveStatus('saving')
    try {
      await fetch(`/api/atendimentos/${id}`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ fichaCorporal: data, privacidade }),
      })
      setSaveStatus('saved')
    } catch {
      setSaveStatus('idle')
      toast('Erro ao salvar rascunho', 'error')
    }
  }, [id, privacidade])

  // Esta função será passada como prop para os componentes das seções
  const handleFichaCorporalChange = useCallback(
    (updates: Partial<FichaCorporalData>) => {
      setFichaCorporal(prev => {
        const next = { ...prev, ...updates }
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
        saveTimeoutRef.current = setTimeout(() => autoSave(next), 2000)
        return next
      })
    },
    [autoSave]
  )

  // ── Finalizar atendimento ──────────────────────────────────────────────────

  async function handleFinalizar() {
    try {
      setFinalizando(true)
      await fetch(`/api/atendimentos/${id}`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          status:       'finalizado',
          timerSeconds,
          fichaCorporal,
          privacidade,
        }),
      })
      toast('Atendimento finalizado com sucesso!', 'success')
      router.push('/atendimentos')
    } catch (err) {
      console.error('Erro ao finalizar:', err)
      toast('Erro ao finalizar atendimento', 'error')
    } finally {
      setFinalizando(false)
    }
  }

  // ── Cancelar — salva rascunho e volta ──────────────────────────────────────

  async function handleCancelar() {
    await fetch(`/api/atendimentos/${id}`, {
      method:  'PUT',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ timerSeconds, fichaCorporal, privacidade }),
    })
    toast('Rascunho salvo', 'info')
    router.push('/atendimentos')
  }

  // ── Loading ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <AuthGuard requiredPermission="dashboard">
        <AppHeader activePage="atendimentos" />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 'calc(100vh - 64px)', background: 'var(--bg)' }}>
          <div style={{ textAlign: 'center' }}>
            <span className="material-symbols-outlined spinning" style={{ fontSize: '3rem', color: 'var(--primary)', marginBottom: 16, display: 'block' }}>progress_activity</span>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', fontWeight: 600 }}>Carregando atendimento...</p>
          </div>
        </div>
      </AuthGuard>
    )
  }

  if (!atendimento) {
    return (
      <AuthGuard requiredPermission="dashboard">
        <AppHeader activePage="atendimentos" />
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 'calc(100vh - 64px)', gap: 12, background: 'var(--bg)' }}>
          <div style={{
            width: 56, height: 56, borderRadius: 16,
            background: 'var(--card-bg)', border: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 28, color: 'var(--text-muted)' }}>search_off</span>
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', fontWeight: 600 }}>Atendimento não encontrado.</p>
          <button
            onClick={() => router.push('/atendimentos')}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--primary)', fontSize: '0.85rem', fontWeight: 700,
              fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4,
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>arrow_back</span>
            Voltar para listagem
          </button>
        </div>
      </AuthGuard>
    )
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <AuthGuard requiredPermission="dashboard">
      <AppHeader activePage="atendimentos" />
      <div style={{ display: 'flex', height: 'calc(100vh - 64px)', overflow: 'hidden', background: 'var(--bg)' }}>

        {/* ── Sidebar esquerda ────────────────────────────────────────────── */}
        <aside style={{
          width: 260, borderRight: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column', flexShrink: 0,
          overflow: 'hidden', background: 'var(--card-bg)',
        }}>

          {/* Info do paciente */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: 16, borderBottom: '1px solid var(--border)',
          }}>
            <div style={{
              width: 40, height: 40, borderRadius: 12,
              background: 'linear-gradient(135deg, var(--primary), #ff4db1)',
              color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '0.82rem', fontWeight: 800, flexShrink: 0,
              boxShadow: '0 2px 8px rgba(230,0,126,0.2)',
            }}>
              {atendimento.clientName.slice(0, 2).toUpperCase()}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <p style={{
                margin: 0, fontSize: '0.88rem', fontWeight: 800,
                color: 'var(--text-main)', overflow: 'hidden',
                textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {atendimento.clientName}
              </p>
              <p style={{
                margin: '2px 0 0', fontSize: '0.72rem',
                color: 'var(--text-muted)', overflow: 'hidden',
                textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {atendimento.unit}
              </p>
            </div>
            <button
              style={{
                padding: 6, borderRadius: 8, border: '1px solid var(--border)',
                background: 'transparent', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--text-muted)' }}>content_paste</span>
            </button>
          </div>

          {/* Label de seção */}
          <div style={{
            padding: '12px 16px 6px', fontSize: '0.65rem', fontWeight: 800,
            color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px',
          }}>
            Fichas
          </div>

          {/* Navegação das fichas */}
          <nav style={{ flex: 1, overflowY: 'auto', padding: '0 8px 8px' }}>
            {FICHAS.map(ficha => {
              const isActive = fichaAtiva === ficha.key
              const isHovered = hoveredFicha === ficha.key

              return (
                <button
                  key={ficha.key}
                  onClick={() => ficha.available && setFichaAtiva(ficha.key)}
                  disabled={!ficha.available}
                  onMouseEnter={() => ficha.available && setHoveredFicha(ficha.key)}
                  onMouseLeave={() => setHoveredFicha(null)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center',
                    justifyContent: 'space-between', gap: 8,
                    padding: '10px 12px', marginBottom: 2,
                    fontSize: '0.85rem', fontWeight: isActive ? 700 : 600,
                    fontFamily: 'inherit', textAlign: 'left',
                    borderRadius: 10, border: 'none',
                    cursor: ficha.available ? 'pointer' : 'not-allowed',
                    transition: 'all 0.15s',
                    background: isActive
                      ? 'linear-gradient(135deg, var(--primary), #ff4db1)'
                      : isHovered
                        ? 'var(--bg)'
                        : 'transparent',
                    color: isActive
                      ? '#fff'
                      : ficha.available
                        ? 'var(--text-main)'
                        : 'var(--text-muted)',
                    opacity: ficha.available ? 1 : 0.55,
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="material-symbols-outlined" style={{
                      fontSize: 18,
                      color: isActive ? 'rgba(255,255,255,0.85)' : 'var(--text-muted)',
                    }}>{ficha.icon}</span>
                    {ficha.label}
                  </span>

                  {isActive && (
                    <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'rgba(255,255,255,0.7)' }}>chevron_right</span>
                  )}

                  {!ficha.available && (
                    <span style={{
                      fontSize: '0.62rem', fontWeight: 700,
                      color: 'var(--text-muted)', opacity: 0.6,
                    }}>em breve</span>
                  )}
                </button>
              )
            })}
          </nav>
        </aside>

        {/* ── Área de conteúdo ─────────────────────────────────────────────── */}
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>

          {/* Scroll area */}
          <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 80 }}>
            <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 32px' }}>

              {fichaAtiva === 'corporal' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 48 }}>

                  <DistribuicaoGordura
                    dados={fichaCorporal}
                    onChange={handleFichaCorporalChange}
                  />

                  <div style={{ height: 1, background: 'var(--border)' }} />

                  <CalculoIMC
                    dados={fichaCorporal}
                    onChange={handleFichaCorporalChange}
                  />

                  <div style={{ height: 1, background: 'var(--border)' }} />

                  <Adipometria
                    dados={fichaCorporal}
                    onChange={handleFichaCorporalChange}
                  />

                  <div style={{ height: 1, background: 'var(--border)' }} />

                  <Perimetria
                    dados={fichaCorporal}
                    onChange={handleFichaCorporalChange}
                  />

                  <div style={{ height: 1, background: 'var(--border)' }} />

                  <GrauCelulite
                    dados={fichaCorporal}
                    onChange={handleFichaCorporalChange}
                  />

                  <div style={{ height: 1, background: 'var(--border)' }} />

                  <Estrias
                    dados={fichaCorporal}
                    onChange={handleFichaCorporalChange}
                  />

                  <div style={{ height: 1, background: 'var(--border)' }} />

                  <TesteDiastase
                    dados={fichaCorporal}
                    onChange={handleFichaCorporalChange}
                  />

                  <div style={{ height: 1, background: 'var(--border)' }} />

                  <AparenciaCorporal
                    dados={fichaCorporal}
                    onChange={handleFichaCorporalChange}
                  />

                </div>
              )}

              {/* Outras fichas — em breve */}
              {fichaAtiva !== 'corporal' && (
                <div style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  justifyContent: 'center', padding: '96px 0', textAlign: 'center', gap: 12,
                }}>
                  <div style={{
                    width: 56, height: 56, borderRadius: 16,
                    background: 'var(--card-bg)', border: '1px solid var(--border)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 28, color: 'var(--text-muted)', opacity: 0.5 }}>lock</span>
                  </div>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', fontWeight: 600 }}>Esta ficha estará disponível em breve.</p>
                </div>
              )}

            </div>
          </div>

          {/* ── Barra de ações fixa no rodapé ──────────────────────────────── */}
          <div style={{
            flexShrink: 0, borderTop: '1px solid var(--border)',
            background: 'var(--card-bg)', padding: '12px 32px',
            display: 'flex', alignItems: 'center', gap: 16, zIndex: 40,
          }}>

            {/* Timer */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              fontSize: '0.88rem', color: 'var(--primary)',
              fontFamily: 'monospace', fontWeight: 700,
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--primary)' }}>timer</span>
              {formatTimer(timerSeconds)}
            </div>

            {/* Privacidade */}
            <button
              onClick={() => setPrivacidade(p => p === 'privado' ? 'compartilhado' : 'privado')}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                fontSize: '0.82rem', fontWeight: 600,
                color: 'var(--text-muted)', fontFamily: 'inherit',
                border: '1px solid var(--border)', borderRadius: 20,
                padding: '6px 14px', background: 'transparent',
                cursor: 'pointer', transition: 'all 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.color = 'var(--text-main)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-muted)' }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                {privacidade === 'privado' ? 'lock' : 'lock_open'}
              </span>
              {privacidade === 'privado' ? 'Privado' : 'Compartilhado'}
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>expand_more</span>
            </button>

            {/* Badge de save */}
            <SaveBadge status={saveStatus} />

            <div style={{ flex: 1 }} />

            {/* Cancelar */}
            <button
              onClick={handleCancelar}
              style={{
                fontSize: '0.85rem', fontWeight: 700,
                color: 'var(--text-muted)', fontFamily: 'inherit',
                padding: '8px 18px', borderRadius: 10,
                border: '1px solid var(--border)', background: 'transparent',
                cursor: 'pointer', transition: 'all 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.color = 'var(--text-main)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-muted)' }}
            >
              Cancelar
            </button>

            {/* Finalizar */}
            <button
              onClick={handleFinalizar}
              disabled={finalizando}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                background: finalizando ? '#94a3b8' : 'linear-gradient(135deg, var(--primary), #ff4db1)',
                color: '#fff', fontSize: '0.88rem', fontWeight: 800,
                fontFamily: 'inherit', padding: '10px 24px',
                borderRadius: 12, border: 'none',
                cursor: finalizando ? 'not-allowed' : 'pointer',
                transition: 'all 0.15s',
                boxShadow: finalizando ? 'none' : '0 2px 12px rgba(230,0,126,0.25)',
              }}
            >
              {finalizando && (
                <span className="material-symbols-outlined spinning" style={{ fontSize: 16 }}>progress_activity</span>
              )}
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>check_circle</span>
              Finalizar atendimento
            </button>

          </div>
        </main>
      </div>
    </AuthGuard>
  )
}
