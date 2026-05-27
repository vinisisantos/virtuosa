'use client'

import type { FichaCorporalData } from '@/app/atendimentos/[id]/page'

interface Props {
  dados:    FichaCorporalData
  onChange: (updates: Partial<FichaCorporalData>) => void
}

// ─── Ilustrações SVG ──────────────────────────────────────────────────────────

function IlustraRubra() {
  return (
    <svg viewBox="0 0 80 60" className="w-full h-full" fill="none">
      {/* Fundo pele */}
      <rect width="80" height="60" rx="4" fill="#FDE8D8"/>
      {/* Estrias rubras — linhas avermelhadas/rosadas */}
      {[
        'M15,12 Q25,18 18,28',
        'M30,8  Q38,20 32,32',
        'M48,10 Q55,22 50,35',
        'M62,14 Q68,24 64,38',
        'M22,35 Q30,45 25,55',
        'M42,32 Q50,44 46,56',
        'M58,36 Q65,46 62,54',
      ].map((d, i) => (
        <path key={i} d={d} stroke="#E05A5A" strokeWidth="2" strokeLinecap="round" opacity={0.6 + (i % 3) * 0.1}/>
      ))}
    </svg>
  )
}

function IlustraAlba() {
  return (
    <svg viewBox="0 0 80 60" className="w-full h-full" fill="none">
      {/* Fundo pele */}
      <rect width="80" height="60" rx="4" fill="#FDE8D8"/>
      {/* Estrias alba — linhas esbranquiçadas/prateadas */}
      {[
        'M15,12 Q25,18 18,28',
        'M30,8  Q38,20 32,32',
        'M48,10 Q55,22 50,35',
        'M62,14 Q68,24 64,38',
        'M22,35 Q30,45 25,55',
        'M42,32 Q50,44 46,56',
        'M58,36 Q65,46 62,54',
      ].map((d, i) => (
        <path key={i} d={d} stroke="#F5F0EB" strokeWidth="2.5" strokeLinecap="round" opacity={0.7 + (i % 3) * 0.08}/>
      ))}
    </svg>
  )
}

// ─── Dados ────────────────────────────────────────────────────────────────────

const TIPOS = [
  {
    key:   'rubra' as const,
    label: 'Rubra',
    desc:  'Estrias recentes, avermelhadas ou rosadas. Maior chance de tratamento.',
    Ilustra: IlustraRubra,
  },
  {
    key:   'alba' as const,
    label: 'Alba',
    desc:  'Estrias antigas, esbranquiçadas ou prateadas. Mais difíceis de tratar.',
    Ilustra: IlustraAlba,
  },
]

// ─── Componente ───────────────────────────────────────────────────────────────

export default function Estrias({ dados, onChange }: Props) {
  const selected = dados.tipoEstria

  return (
    <section>
      <h2 className="text-lg font-semibold text-gray-900 mb-6">
        Estrias
      </h2>

      {/* Seletor de tipo */}
      <div className="flex gap-4 mb-6">
        {TIPOS.map(({ key, label, desc, Ilustra }) => (
          <button
            key={key}
            onClick={() => onChange({ tipoEstria: selected === key ? null : key })}
            className={[
              'flex flex-col items-center gap-3 p-4 rounded-xl border-2 transition-all',
              'w-44 hover:shadow-md active:scale-95',
              selected === key
                ? 'border-purple-500 bg-purple-50 shadow-sm'
                : 'border-gray-200 bg-gray-50 hover:border-gray-300',
            ].join(' ')}
          >
            <div className="w-full h-20 rounded-lg overflow-hidden border border-gray-100">
              <Ilustra />
            </div>
            <span className={`text-sm font-semibold ${
              selected === key ? 'text-purple-700' : 'text-gray-700'
            }`}>
              {label}
            </span>
            <span className="text-xs text-gray-400 text-center leading-tight">
              {desc}
            </span>
          </button>
        ))}
      </div>

      {/* Observações */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          Observações
        </label>
        <textarea
          rows={3}
          placeholder="Localização, extensão, características..."
          value={dados.observacoesEstria ?? ''}
          onChange={e => onChange({ observacoesEstria: e.target.value })}
          className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm
                     focus:outline-none focus:ring-2 focus:ring-purple-100
                     focus:border-purple-400 placeholder-gray-400 resize-none
                     transition-colors"
        />
      </div>
    </section>
  )
}
