'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
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

const FICHAS: { key: FichaKey; label: string; available: boolean }[] = [
  { key: 'anamnese',    label: 'Anamnese',            available: false },
  { key: 'capilar',     label: 'Capilar',             available: false },
  { key: 'corporal',    label: 'Corporal',             available: true  },
  { key: 'epilacao',    label: 'Epilação',             available: false },
  { key: 'facial',      label: 'Facial',               available: false },
  { key: 'fotos',       label: 'Fotos e anexos',       available: false },
  { key: 'injetaveis',  label: 'Injetáveis',           available: false },
  { key: 'orcamento',   label: 'Orçamento',            available: false },
  { key: 'plano',       label: 'Plano de tratamento',  available: false },
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
    <span className="flex items-center gap-1.5 text-xs text-gray-400">
      <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity=".25"/>
        <path d="M12 2a10 10 0 0110 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
      </svg>
      Salvando...
    </span>
  )

  return (
    <span className="flex items-center gap-1.5 text-xs text-gray-400">
      <svg className="w-3.5 h-3.5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/>
      </svg>
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
      router.push('/atendimentos')
    } catch (err) {
      console.error('Erro ao finalizar:', err)
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
    router.push('/atendimentos')
  }

  // ── Loading ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!atendimento) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-3">
        <p className="text-gray-500 text-sm">Atendimento não encontrado.</p>
        <button
          onClick={() => router.push('/atendimentos')}
          className="text-purple-600 text-sm hover:underline"
        >
          ← Voltar para listagem
        </button>
      </div>
    )
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-screen overflow-hidden bg-white">

      {/* ── Sidebar esquerda ────────────────────────────────────────────── */}
      <aside className="w-64 border-r border-gray-200 flex flex-col flex-shrink-0 overflow-hidden">

        {/* Info do paciente */}
        <div className="flex items-center gap-3 p-4 border-b border-gray-100">
          <div className="w-10 h-10 rounded-full bg-purple-100 text-purple-700
                          flex items-center justify-center text-sm font-semibold flex-shrink-0">
            {atendimento.clientName.slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-gray-900 truncate">
              {atendimento.clientName}
            </p>
            <p className="text-xs text-gray-400 mt-0.5 truncate">
              {atendimento.unit}
            </p>
          </div>
          <button className="p-1.5 rounded hover:bg-gray-100 text-gray-400
                             hover:text-gray-600 transition-colors flex-shrink-0">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2
                   M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </button>
        </div>

        {/* Navegação das fichas */}
        <nav className="flex-1 overflow-y-auto py-1">
          {FICHAS.map(ficha => (
            <button
              key={ficha.key}
              onClick={() => ficha.available && setFichaAtiva(ficha.key)}
              disabled={!ficha.available}
              className={[
                'w-full flex items-center justify-between px-4 py-2.5 text-sm transition-colors text-left',
                fichaAtiva === ficha.key
                  ? 'bg-purple-600 text-white font-medium'
                  : ficha.available
                    ? 'text-gray-700 hover:bg-gray-50 cursor-pointer'
                    : 'text-gray-400 cursor-not-allowed',
              ].join(' ')}
            >
              <span>{ficha.label}</span>

              {fichaAtiva === ficha.key && (
                <svg className="w-4 h-4 text-purple-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}

              {!ficha.available && (
                <span className="text-xs text-gray-300">em breve</span>
              )}
            </button>
          ))}
        </nav>
      </aside>

      {/* ── Área de conteúdo ─────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Scroll area */}
        <div className="flex-1 overflow-y-auto pb-20">
          <div className="max-w-4xl mx-auto px-8 py-8">

            {fichaAtiva === 'corporal' && (
              <div className="space-y-12">

                <DistribuicaoGordura
                  dados={fichaCorporal}
                  onChange={handleFichaCorporalChange}
                />

                <hr className="border-gray-100" />

                <CalculoIMC
                  dados={fichaCorporal}
                  onChange={handleFichaCorporalChange}
                />

                <hr className="border-gray-100" />

                <Adipometria
                  dados={fichaCorporal}
                  onChange={handleFichaCorporalChange}
                />

                <hr className="border-gray-100" />

                <Perimetria
                  dados={fichaCorporal}
                  onChange={handleFichaCorporalChange}
                />

                <hr className="border-gray-100" />

                <GrauCelulite
                  dados={fichaCorporal}
                  onChange={handleFichaCorporalChange}
                />

                <hr className="border-gray-100" />

                <Estrias
                  dados={fichaCorporal}
                  onChange={handleFichaCorporalChange}
                />

                <hr className="border-gray-100" />

                <TesteDiastase
                  dados={fichaCorporal}
                  onChange={handleFichaCorporalChange}
                />

                <hr className="border-gray-100" />

                <AparenciaCorporal
                  dados={fichaCorporal}
                  onChange={handleFichaCorporalChange}
                />

              </div>
            )}

            {/* Outras fichas — em breve */}
            {fichaAtiva !== 'corporal' && (
              <div className="flex flex-col items-center justify-center py-24 text-center gap-3">
                <div className="w-14 h-14 rounded-full bg-gray-50 flex items-center justify-center">
                  <svg className="w-7 h-7 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                      d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2
                         2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <p className="text-gray-400 text-sm">Esta ficha estará disponível em breve.</p>
              </div>
            )}

          </div>
        </div>

        {/* ── Barra de ações fixa no rodapé ──────────────────────────────── */}
        <div className="flex-shrink-0 border-t border-gray-200 bg-white px-8 py-3
                        flex items-center gap-4 z-40">

          {/* Timer */}
          <div className="flex items-center gap-1.5 text-sm text-purple-500 font-mono font-medium">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {formatTimer(timerSeconds)}
          </div>

          {/* Privacidade */}
          <button
            onClick={() => setPrivacidade(p => p === 'privado' ? 'compartilhado' : 'privado')}
            className="flex items-center gap-1.5 text-sm text-gray-500 border border-gray-200
                       rounded-full px-3 py-1 hover:bg-gray-50 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            {privacidade === 'privado' ? 'Privado' : 'Compartilhado'}
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {/* Badge de save */}
          <SaveBadge status={saveStatus} />

          <div className="flex-1" />

          {/* Cancelar */}
          <button
            onClick={handleCancelar}
            className="text-sm text-gray-500 hover:text-gray-700 transition-colors px-3 py-1.5"
          >
            Cancelar
          </button>

          {/* Finalizar */}
          <button
            onClick={handleFinalizar}
            disabled={finalizando}
            className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700
                       disabled:opacity-60 text-white text-sm font-medium
                       px-5 py-2 rounded-lg transition-colors active:scale-95"
          >
            {finalizando && (
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity=".25"/>
                <path d="M12 2a10 10 0 0110 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
              </svg>
            )}
            Finalizar atendimento
          </button>

        </div>
      </main>
    </div>
  )
}
