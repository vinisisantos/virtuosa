'use client'

import type { FichaCorporalData } from '@/app/atendimentos/[id]/page'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface DobraduraData {
  m1:      number | null
  m2:      number | null
  m3:      number | null
  mediana: number
}

type AdipoData = Record<string, DobraduraData>

interface Props {
  dados:    FichaCorporalData
  onChange: (updates: Partial<FichaCorporalData>) => void
}

// ─── Dobras e descrições ──────────────────────────────────────────────────────

const DOBRAS = [
  {
    key:       'tricipital',
    label:     'Tricipital',
    descricao: 'Prega vertical na face posterior do braço, ponto médio entre o acrômio e o olécrano.',
  },
  {
    key:       'subescapular',
    label:     'Subescapular',
    descricao: 'Prega diagonal, abaixo e medialmente ao ângulo inferior da escápula.',
  },
  {
    key:       'bicipital',
    label:     'Bicipital',
    descricao: 'Prega vertical na face anterior do braço, no mesmo nível da dobra tricipital.',
  },
  {
    key:       'axilar',
    label:     'Axilar',
    descricao: 'Prega oblíqua na linha axilar média, ao nível do processo xifóide.',
  },
  {
    key:       'iliaca',
    label:     'Ilíaca',
    descricao: 'Prega diagonal imediatamente acima da crista ilíaca, na linha axilar média.',
  },
  {
    key:       'supraespinhal',
    label:     'Supraespinhal',
    descricao: 'Prega oblíqua sobre a crista ilíaca ântero-superior, direção oblíqua para baixo e medial.',
  },
  {
    key:       'abdominal',
    label:     'Abdominal',
    descricao: 'Prega vertical, 3 cm lateral e 1 cm abaixo da cicatriz umbilical.',
  },
  {
    key:       'coxa',
    label:     'Coxa',
    descricao: 'Prega vertical na face anterior da coxa, ponto médio entre a prega inguinal e a borda da patela.',
  },
  {
    key:       'panturrilha',
    label:     'Panturrilha',
    descricao: 'Prega vertical na face interna da panturrilha, no ponto de maior circunferência.',
  },
]

// ─── Cálculos ─────────────────────────────────────────────────────────────────

function calcularMediana(
  m1: number | null,
  m2: number | null,
  m3: number | null,
): number {
  const valores = [m1, m2, m3].filter((v): v is number => v !== null && !isNaN(v))
  if (valores.length === 0) return 0
  if (valores.length === 1) return valores[0]
  if (valores.length === 2) return (valores[0] + valores[1]) / 2
  return [...valores].sort((a, b) => a - b)[1]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatarMm(valor: number): string {
  return valor.toLocaleString('pt-BR', {
    minimumFractionDigits:  2,
    maximumFractionDigits:  2,
  }) + ' mm'
}

function inicializarAdipoData(raw: unknown): AdipoData {
  const base = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const result: AdipoData = {}
  for (const { key } of DOBRAS) {
    const item = (base[key] ?? {}) as Partial<DobraduraData>
    result[key] = {
      m1:      item.m1      ?? null,
      m2:      item.m2      ?? null,
      m3:      item.m3      ?? null,
      mediana: item.mediana ?? 0,
    }
  }
  return result
}

// ─── Componente ───────────────────────────────────────────────────────────────

export default function Adipometria({ dados, onChange }: Props) {
  const adipoData = inicializarAdipoData(dados.adipometriaData)

  // ── Atualiza uma medida e recalcula a mediana ──────────────────────────────

  function handleMedidaChange(
    dobraKey: string,
    campo:    'm1' | 'm2' | 'm3',
    valor:    string,
  ) {
    const num     = valor !== '' ? parseFloat(valor) : null
    const prev    = adipoData[dobraKey]
    const updated = { ...prev, [campo]: num }

    updated.mediana = calcularMediana(updated.m1, updated.m2, updated.m3)

    const next: AdipoData = { ...adipoData, [dobraKey]: updated }
    onChange({ adipometriaData: next as Record<string, unknown> })
  }

  // ── Soma de todas as medianas ──────────────────────────────────────────────

  const somaMedianas = DOBRAS.reduce(
    (acc, { key }) => acc + (adipoData[key].mediana ?? 0),
    0,
  )

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <section>
      <h2 className="text-lg font-semibold text-gray-900 mb-6">
        Adipometria
      </h2>

      {/* Protocolo + dica */}
      <div className="flex items-start gap-4 mb-6">
        <div className="w-52 flex-shrink-0">
          <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">
            Protocolo
          </label>
          <select
            value={dados.adipometriaProtocolo ?? ''}
            onChange={e => onChange({ adipometriaProtocolo: e.target.value })}
            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-white
                       text-gray-700 focus:outline-none focus:ring-2 focus:ring-purple-100
                       focus:border-purple-400 transition-colors"
          >
            <option value="">Selecione</option>
            <option value="petroski">Petróski</option>
          </select>
        </div>

        <div className="flex-1 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg mt-6">
          <p className="text-xs text-gray-500 leading-relaxed">
            Utilize o Protocolo de Petróski para calcular o percentual de gordura.
          </p>
        </div>
      </div>

      {/* Tabela das dobras */}
      <div className="border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500
                             uppercase tracking-wide w-44">
                Dobra
              </th>
              {['1ª Medida', '2ª Medida', '3ª Medida'].map(col => (
                <th key={col}
                    className="text-center px-2 py-3 text-xs font-semibold text-gray-500
                               uppercase tracking-wide">
                  {col}
                </th>
              ))}
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500
                             uppercase tracking-wide w-32">
                Mediana
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-gray-100">
            {DOBRAS.map(({ key, label, descricao }) => {
              const item = adipoData[key]
              return (
                <tr key={key} className="hover:bg-gray-50/50 transition-colors">

                  {/* Nome da dobra + botão de ajuda */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-700 font-medium whitespace-nowrap">
                        {label}
                      </span>
                      <button
                        type="button"
                        title={descricao}
                        className="w-4 h-4 rounded-full border border-gray-300 text-gray-400
                                   hover:border-purple-400 hover:text-purple-500 transition-colors
                                   flex items-center justify-center text-xs font-bold flex-shrink-0"
                      >
                        ?
                      </button>
                    </div>
                  </td>

                  {/* 3 inputs de medida */}
                  {(['m1', 'm2', 'm3'] as const).map(campo => (
                    <td key={campo} className="px-2 py-2.5 text-center">
                      <input
                        type="number"
                        min="0"
                        step="0.1"
                        placeholder="mm"
                        value={item[campo] ?? ''}
                        onChange={e => handleMedidaChange(key, campo, e.target.value)}
                        className="w-20 px-2 py-1.5 text-center border border-gray-300 rounded-lg
                                   text-sm focus:outline-none focus:ring-2 focus:ring-purple-100
                                   focus:border-purple-400 placeholder-gray-300 transition-colors"
                      />
                    </td>
                  ))}

                  {/* Mediana calculada automaticamente */}
                  <td className="px-4 py-3 text-right">
                    <span className={`text-sm font-medium tabular-nums ${
                      item.mediana > 0 ? 'text-gray-900' : 'text-gray-400'
                    }`}>
                      {formatarMm(item.mediana)}
                    </span>
                  </td>

                </tr>
              )
            })}
          </tbody>

          {/* Rodapé: soma total das medianas */}
          <tfoot>
            <tr className={`border-t ${
              somaMedianas > 0
                ? 'bg-purple-50 border-purple-100'
                : 'bg-gray-50 border-gray-200'
            }`}>
              <td colSpan={4} className={`px-4 py-3 text-sm font-semibold ${
                somaMedianas > 0 ? 'text-purple-700' : 'text-gray-400'
              }`}>
                Σ Soma das medianas
              </td>
              <td className={`px-4 py-3 text-right text-sm font-bold tabular-nums ${
                somaMedianas > 0 ? 'text-purple-700' : 'text-gray-400'
              }`}>
                {formatarMm(somaMedianas)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  )
}
