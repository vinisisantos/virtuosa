'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

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

function avatarColor(name: string): string {
  const palette = [
    'bg-purple-100 text-purple-700',
    'bg-blue-100   text-blue-700',
    'bg-green-100  text-green-700',
    'bg-amber-100  text-amber-700',
    'bg-pink-100   text-pink-700',
    'bg-teal-100   text-teal-700',
    'bg-red-100    text-red-700',
  ]
  return palette[name.charCodeAt(0) % palette.length]
}

// ─── Iniciais (máx 2 letras) ──────────────────────────────────────────────────

function initials(name: string): string {
  return name
    .trim()
    .split(' ')
    .slice(0, 2)
    .map(n => n[0])
    .join('')
    .toUpperCase()
}

// ─── Modal ────────────────────────────────────────────────────────────────────

export default function NovoAtendimentoModal({ isOpen, onClose }: Props) {
  const router = useRouter()

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
      // Reset ao fechar
      setSearch('')
      setSelectedClient(null)
      setDropdownOpen(false)
      return
    }

    async function fetchClients() {
      setLoadingClients(true)
      try {
        const unit   = localStorage.getItem('selectedUnit')
        const params = new URLSearchParams({ limit: '200', orderBy: 'name' })
        if (unit) params.set('unit', unit)

        const res  = await fetch(`/api/clients?${params}`)
        const data = await res.json()

        // Suporta tanto { clients: [] } quanto []
        setClients(Array.isArray(data) ? data : (data.clients ?? []))
      } catch (err) {
        console.error('Erro ao buscar clientes:', err)
      } finally {
        setLoadingClients(false)
      }
    }

    fetchClients()
  }, [isOpen])

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
      const unit = localStorage.getItem('selectedUnit') || selectedClient.unit

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

  // ── Não renderiza se fechado ──────────────────────────────────────────────

  if (!isOpen) return null

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
        onClick={e => { if (e.target === e.currentTarget) onClose() }}
      >
        {/* Card do modal */}
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">

          {/* Cabeçalho */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <h2 className="text-base font-semibold text-gray-900">
              Novo atendimento
            </h2>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400
                         hover:text-gray-600 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Corpo */}
          <div className="px-6 py-5">

            {/* Label + link adicionar */}
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700">
                Paciente
              </label>
              <button className="text-xs text-purple-600 hover:text-purple-700 font-medium transition-colors">
                + Adicionar
              </button>
            </div>

            {/* Dropdown de seleção */}
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setDropdownOpen(o => !o)}
                className={[
                  'w-full flex items-center justify-between px-3 py-2.5 rounded-lg border text-sm transition-colors',
                  dropdownOpen
                    ? 'border-purple-400 ring-2 ring-purple-100'
                    : 'border-gray-300 hover:border-gray-400',
                ].join(' ')}
              >
                {selectedClient ? (
                  <div className="flex items-center gap-2.5">
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold ${avatarColor(selectedClient.name)}`}>
                      {initials(selectedClient.name)}
                    </span>
                    <span className="text-gray-900 font-medium">{selectedClient.name}</span>
                  </div>
                ) : (
                  <span className="text-gray-400">Selecione</span>
                )}
                <svg
                  className={`w-4 h-4 text-gray-400 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* Lista dropdown */}
              {dropdownOpen && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200
                                rounded-xl shadow-xl z-10 overflow-hidden">

                  {/* Search input */}
                  <div className="p-2 border-b border-gray-100">
                    <input
                      ref={searchRef}
                      type="text"
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      placeholder="Buscar paciente..."
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg
                                 focus:outline-none focus:ring-2 focus:ring-purple-100 focus:border-purple-400
                                 placeholder-gray-400"
                    />
                  </div>

                  {/* Lista de clientes */}
                  <ul className="max-h-56 overflow-y-auto py-1">

                    {loadingClients && (
                      <li className="px-4 py-3 text-sm text-gray-400 text-center">
                        Carregando...
                      </li>
                    )}

                    {!loadingClients && filtered.length === 0 && (
                      <li className="px-4 py-3 text-sm text-gray-400 text-center">
                        Nenhum paciente encontrado.
                      </li>
                    )}

                    {!loadingClients && filtered.map(client => (
                      <li key={client.id}>
                        <button
                          onClick={() => {
                            setSelectedClient(client)
                            setDropdownOpen(false)
                            setSearch('')
                          }}
                          className={[
                            'w-full flex items-center justify-between px-4 py-2.5',
                            'text-sm hover:bg-gray-50 transition-colors text-left',
                            selectedClient?.id === client.id ? 'bg-purple-50' : '',
                          ].join(' ')}
                        >
                          <div className="flex items-center gap-3">
                            <span className={`w-7 h-7 rounded-full flex items-center justify-center
                                             text-xs font-semibold flex-shrink-0 ${avatarColor(client.name)}`}>
                              {initials(client.name)}
                            </span>
                            <span className={selectedClient?.id === client.id
                              ? 'text-purple-700 font-medium'
                              : 'text-gray-700'}
                            >
                              {client.name}
                            </span>
                          </div>

                          {/* Checkmark no selecionado */}
                          {selectedClient?.id === client.id && (
                            <svg className="w-4 h-4 text-purple-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>

          {/* Rodapé */}
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50">
            <button
              onClick={onClose}
              className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2
                         rounded-lg hover:bg-gray-200 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleCreate}
              disabled={!selectedClient || creating}
              className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700
                         disabled:opacity-50 disabled:cursor-not-allowed
                         text-white text-sm font-medium px-5 py-2 rounded-lg
                         transition-colors active:scale-95"
            >
              {creating && (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity=".25"/>
                  <path d="M12 2a10 10 0 0110 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
                </svg>
              )}
              {creating ? 'Criando...' : 'Criar atendimento'}
            </button>
          </div>

        </div>
      </div>
    </>
  )
}
