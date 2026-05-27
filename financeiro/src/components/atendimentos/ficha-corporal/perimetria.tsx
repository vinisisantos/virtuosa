'use client'

import type { FichaCorporalData } from '@/app/atendimentos/[id]/page'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Props {
  dados:    FichaCorporalData
  onChange: (updates: Partial<FichaCorporalData>) => void
}

// ─── Circunferências ──────────────────────────────────────────────────────────

const MEDIDAS = [
  {
    key:       'braco',
    label:     'Braço',
    descricao: 'Circunferência do braço relaxado, ponto médio entre o acrômio e o olécrano.',
  },
  {
    key:       'bracoContraido',
    label:     'Braço Contraído',
    descricao: 'Circunferência do braço com o bíceps contraído e flexionado.',
  },
  {
    key:       'torax',
    label:     'Tórax',
    descricao: 'Circunferência torácica na altura do processo xifóide.',
  },
  {
    key:       'cintura',
    label:     'Cintura',
    descricao: 'Menor circunferência do abdômen, entre a última costela e a crista ilíaca.',
  },
  {
    key:       'quadril',
    label:     'Quadril',
    descricao: 'Maior circunferência da região glútea.',
  },
  {
    key:       'coxaMediana',
    label:     'Coxa mediana',
    descricao: 'Circunferência da coxa no ponto médio entre a prega inguinal e a borda superior da patela.',
  },
  {
    key:       'panturrilha',
    label:     'Panturrilha',
    descricao: 'Maior circunferência da panturrilha.',
  },
  {
    key:       'umero',
    label:     'Úmero',
    descricao: 'Circunferência do braço na altura da epífise do úmero.',
  },
  {
    key:       'femur',
    label:     'Fêmur',
    descricao: 'Circunferência da coxa no terço proximal, próximo ao fêmur.',
  },
]

// ─── Helper ───────────────────────────────────────────────────────────────────

function inicializarDados(raw: unknown): Record<string, number | null> {
  const base = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const result: Record<string, number | null> = {}
  for (const { key } of MEDIDAS) {
    result[key] = typeof base[key] === 'number' ? (base[key] as number) : null
  }
  return result
}

// ─── Componente ───────────────────────────────────────────────────────────────

export default function Perimetria({ dados, onChange }: Props) {
  const perimetriaData = inicializarDados(dados.perimetriaData)

  function handleChange(key: string, valor: string) {
    const num  = valor !== '' ? parseFloat(valor) : null
    const next = { ...perimetriaData, [key]: num }
    onChange({ perimetriaData: next as Record<string, unknown> })
  }

  return (
    <section>
      <h2 className="text-lg font-semibold text-gray-900 mb-6">
        Perimetria
      </h2>

      <div className="grid grid-cols-2 gap-x-10 gap-y-5">
        {MEDIDAS.map(({ key, label, descricao }) => (
          <div key={key}>

            {/* Label + tooltip */}
            <div className="flex items-center gap-1.5 mb-1.5">
              <label className="text-sm font-medium text-gray-700">
                {label}
              </label>
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

            {/* Input com sufixo mm */}
            <div className="relative">
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="0,00"
                value={perimetriaData[key] ?? ''}
                onChange={e => handleChange(key, e.target.value)}
                className="w-full px-3 py-2.5 pr-12 border border-gray-300 rounded-lg text-sm
                           focus:outline-none focus:ring-2 focus:ring-purple-100
                           focus:border-purple-400 placeholder-gray-300 transition-colors"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2
                               text-xs text-gray-400 font-medium pointer-events-none">
                mm
              </span>
            </div>

          </div>
        ))}
      </div>

      {/* Relação Cintura/Quadril — exibida quando ambos preenchidos */}
      {perimetriaData.cintura && perimetriaData.quadril && (
        <div className="mt-6 inline-flex items-center gap-3 px-4 py-2.5
                        bg-purple-50 border border-purple-100 rounded-lg">
          <span className="text-sm text-gray-600">
            Relação Cintura / Quadril (RCQ):
          </span>
          <span className="text-sm font-bold text-purple-700">
            {(perimetriaData.cintura / perimetriaData.quadril).toFixed(2)}
          </span>
        </div>
      )}
    </section>
  )
}
