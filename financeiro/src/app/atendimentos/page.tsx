'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
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

function StatusBadge({ status }: { status: StatusAtendimento }) {
  const map: Record<StatusAtendimento, { label: string; className: string }> = {
    rascunho: {
      label:     'Rascunho',
      className: 'bg-amber-100 text-amber-800 border border-amber-200',
    },
    finalizado: {
      label:     'Finalizado',
      className: 'bg-green-100 text-green-800 border border-green-200',
    },
    finalizado_automaticamente: {
      label:     'Finalizado automaticamente',
      className: 'bg-purple-100 text-purple-800 border border-purple-200',
    },
  }
  const { label, className } = map[status] ?? map['rascunho']
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${className}`}>
      {label}
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

  const [atendimentos, setAtendimentos] = useState<Atendimento[]>([])
  const [total,        setTotal]        = useState(0)
  const [page,         setPage]         = useState(1)
  const [loading,      setLoading]      = useState(true)
  const [isModalOpen,  setIsModalOpen]  = useState(false)
  const [fabOpen,      setFabOpen]      = useState(false)

  const limit = 25

  // ── Busca atendimentos ──────────────────────────────────────────────────────

  const fetchAtendimentos = useCallback(async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams({
        page:  String(page),
        limit: String(limit),
      })

      // Pega a unidade salva no localStorage (padrão do UnitContext do sistema)
      const unit = localStorage.getItem('selectedUnit')
      if (unit) params.set('unit', unit)

      const res  = await fetch(`/api/atendimentos?${params.toString()}`)
      const data: FetchResult = await res.json()

      setAtendimentos(data.atendimentos || [])
      setTotal(data.total || 0)
    } catch (err) {
      console.error('Erro ao buscar atendimentos:', err)
    } finally {
      setLoading(false)
    }
  }, [page])

  useEffect(() => { fetchAtendimentos() }, [fetchAtendimentos])

  // ── Paginação ───────────────────────────────────────────────────────────────

  const totalPages = Math.max(1, Math.ceil(total / limit))

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Breadcrumb */}
      <div className="px-6 pt-6 pb-2">
        <p className="text-sm text-purple-600 font-medium">
          Atendimentos
          <span className="text-gray-400 font-normal"> / Listagem</span>
        </p>
      </div>

      <div className="px-6 pb-24">
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">

          {/* Cabeçalho da tabela */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <h1 className="text-lg font-semibold text-gray-900">
                Listagem de atendimentos
              </h1>
              {!loading && (
                <span className="text-sm text-gray-400">
                  {total} {total === 1 ? 'registro' : 'registros'}
                </span>
              )}
            </div>
            <button className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Exportar
            </button>
          </div>

          {/* Filtro */}
          <div className="px-6 py-3 border-b border-gray-100">
            <button className="flex items-center gap-1.5 text-sm text-purple-600 font-medium hover:text-purple-700 transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Adicionar filtro
            </button>
          </div>

          {/* Tabela */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  {['Data', 'Paciente', 'Profissional', 'Fichas de atendimento', 'Status'].map(col => (
                    <th
                      key={col}
                      className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide"
                    >
                      {col}
                    </th>
                  ))}
                  <th className="px-6 py-3 w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">

                {loading && (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 6 }).map((_, j) => (
                        <td key={j} className="px-6 py-4">
                          <div className="h-4 bg-gray-100 rounded animate-pulse w-24" />
                        </td>
                      ))}
                    </tr>
                  ))
                )}

                {!loading && atendimentos.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-16 text-center text-gray-400 text-sm">
                      Nenhum atendimento encontrado.
                    </td>
                  </tr>
                )}

                {!loading && atendimentos.map(atd => (
                  <tr
                    key={atd.id}
                    onClick={() => router.push(`/atendimentos/${atd.id}`)}
                    className="hover:bg-gray-50 cursor-pointer transition-colors"
                  >
                    <td className="px-6 py-4 text-gray-700 whitespace-nowrap">
                      {formatDate(atd.createdAt)}
                    </td>
                    <td className="px-6 py-4 font-medium text-gray-900">
                      {atd.clientName}
                    </td>
                    <td className="px-6 py-4 text-gray-600">
                      {atd.profissionalName ?? '—'}
                    </td>
                    <td className="px-6 py-4 text-gray-600">
                      Corporal
                    </td>
                    <td className="px-6 py-4">
                      <StatusBadge status={atd.status} />
                    </td>
                    <td
                      className="px-6 py-4 text-gray-400 hover:text-gray-600"
                      onClick={e => e.stopPropagation()}
                    >
                      <button className="p-1 rounded hover:bg-gray-100 transition-colors">
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                          <circle cx="12" cy="5"  r="1.5" />
                          <circle cx="12" cy="12" r="1.5" />
                          <circle cx="12" cy="19" r="1.5" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))}

              </tbody>
            </table>
          </div>

          {/* Rodapé — paginação */}
          <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100">
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <span>{limit} por página</span>
            </div>
            <div className="flex items-center gap-1">
              {/* Primeira página */}
              <button
                onClick={() => setPage(1)}
                disabled={page === 1}
                className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100
                           disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7M18 19l-7-7 7-7" />
                </svg>
              </button>
              {/* Anterior */}
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100
                           disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              {/* Número atual */}
              <span className="w-9 h-9 flex items-center justify-center rounded-lg bg-purple-600 text-white text-sm font-medium">
                {page}
              </span>
              {/* Próxima */}
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100
                           disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
              {/* Última */}
              <button
                onClick={() => setPage(totalPages)}
                disabled={page === totalPages}
                className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100
                           disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M6 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>

        </div>
      </div>

      {/* FAB — botão flutuante */}
      <div className="fixed bottom-6 right-6 flex flex-col items-end gap-2 z-50">

        {/* Opção expandida: Criar atendimento */}
        {fabOpen && (
          <button
            onClick={() => { setIsModalOpen(true); setFabOpen(false) }}
            className="flex items-center gap-2 bg-white border border-gray-200 shadow-lg
                       rounded-full px-4 py-2.5 text-sm font-medium text-gray-700
                       hover:bg-gray-50 transition-all animate-in slide-in-from-bottom-2"
          >
            <svg className="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            Criar atendimento
          </button>
        )}

        {/* Botão principal */}
        <button
          onClick={() => setFabOpen(o => !o)}
          className="w-14 h-14 rounded-full bg-purple-600 hover:bg-purple-700
                     text-white shadow-xl flex items-center justify-center
                     transition-all active:scale-95"
        >
          <svg
            className={`w-6 h-6 transition-transform duration-200 ${fabOpen ? 'rotate-45' : ''}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>

      </div>

      {/* Modal de novo atendimento */}
      <NovoAtendimentoModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />

    </div>
  )
}
