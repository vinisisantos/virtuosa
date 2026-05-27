'use client'

import type { FichaCorporalData } from '@/app/atendimentos/[id]/page'

interface Props {
  dados:    FichaCorporalData
  onChange: (updates: Partial<FichaCorporalData>) => void
}

// ─── Ilustrações de corte da pele por grau ────────────────────────────────────

function IlustraCelulite({ grau }: { grau: 1 | 2 | 3 | 4 }) {
  const skin = {
    1: {
      bg:      '#FDE8D8',
      surface: 'M0,28 Q20,26 40,28 Q60,30 80,28',
      fat:     '#F5C4A0',
      septa:   [] as { x: number; y1: number; y2: number }[],
    },
    2: {
      bg:      '#FDDAC0',
      surface: 'M0,27 Q18,24 25,30 Q38,26 52,30 Q66,26 80,27',
      fat:     '#F0A878',
      septa:   [{ x: 25, y1: 30, y2: 38 }, { x: 52, y1: 30, y2: 38 }],
    },
    3: {
      bg:      '#FBCBA8',
      surface: 'M0,26 Q15,22 22,32 Q32,24 44,32 Q57,22 65,32 Q73,24 80,25',
      fat:     '#E88A50',
      septa:   [
        { x: 22, y1: 32, y2: 42 },
        { x: 44, y1: 32, y2: 42 },
        { x: 65, y1: 32, y2: 42 },
      ],
    },
    4: {
      bg:      '#F8B898',
      surface: 'M0,25 Q12,19 18,35 Q26,22 36,36 Q46,20 55,36 Q64,22 72,36 Q77,22 80,24',
      fat:     '#D86030',
      septa:   [
        { x: 18, y1: 35, y2: 46 },
        { x: 36, y1: 36, y2: 46 },
        { x: 55, y1: 36, y2: 46 },
        { x: 72, y1: 36, y2: 46 },
      ],
    },
  }

  const c = skin[grau]

  return (
    <svg viewBox="0 0 80 60" className="w-full h-full" fill="none">
      {/* Fundo — tecido adiposo */}
      <rect width="80" height="60" fill={c.bg}/>
      {/* Depósitos de gordura */}
      <ellipse cx="22" cy="46" rx="16" ry="9" fill={c.fat} opacity=".5"/>
      <ellipse cx="58" cy="48" rx="14" ry="8" fill={c.fat} opacity=".5"/>
      {/* Septos fibrosos (formam as covinhas) */}
      {c.septa.map((s, i) => (
        <line key={i} x1={s.x} y1={s.y1} x2={s.x} y2={s.y2}
              stroke={c.fat} strokeWidth="1.5" opacity=".8"/>
      ))}
      {/* Superfície da pele */}
      <path d={`${c.surface} L80,0 L0,0 Z`} fill="#FDDDC0" opacity=".5"/>
      <path d={c.surface} stroke="#C07848" strokeWidth="2.5" strokeLinecap="round"/>
    </svg>
  )
}

// ─── Dados dos graus ──────────────────────────────────────────────────────────

const GRAUS = [
  { value: 1 as const, label: 'Grau 01', desc: 'Visível apenas ao comprimir a pele.' },
  { value: 2 as const, label: 'Grau 02', desc: 'Ondulações visíveis em pé.'          },
  { value: 3 as const, label: 'Grau 03', desc: 'Visível em pé e ao deitar.'           },
  { value: 4 as const, label: 'Grau 04', desc: 'Intensa, dolorosa ao toque.'          },
]

// ─── Componente ───────────────────────────────────────────────────────────────

export default function GrauCelulite({ dados, onChange }: Props) {
  const selected = dados.grauCelulite

  return (
    <section>
      <h2 className="text-lg font-semibold text-gray-900 mb-6">
        Grau de celulite
      </h2>

      <div className="grid grid-cols-4 gap-3">
        {GRAUS.map(({ value, label, desc }) => (
          <button
            key={value}
            onClick={() => onChange({ grauCelulite: selected === value ? null : value })}
            className={[
              'flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all',
              'hover:shadow-md active:scale-95',
              selected === value
                ? 'border-purple-500 bg-purple-50 shadow-sm'
                : 'border-gray-200 bg-gray-50 hover:border-gray-300',
            ].join(' ')}
          >
            <div className="w-full h-20 rounded-lg overflow-hidden border border-gray-100">
              <IlustraCelulite grau={value} />
            </div>
            <span className={`text-sm font-semibold ${
              selected === value ? 'text-purple-700' : 'text-gray-700'
            }`}>
              {label}
            </span>
            <span className="text-xs text-gray-400 text-center leading-tight">
              {desc}
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}
