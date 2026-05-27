'use client'

import type { FichaCorporalData } from '@/app/atendimentos/[id]/page'

interface Props {
  dados:    FichaCorporalData
  onChange: (updates: Partial<FichaCorporalData>) => void
}

// ─── Silhuetas SVG ────────────────────────────────────────────────────────────

function BodyAndroide() {
  return (
    <svg viewBox="0 0 80 195" className="w-full h-full" fill="none">
      {/* Cabeça */}
      <circle cx="40" cy="17" r="13" fill="#CBD5E1"/>
      {/* Pescoço */}
      <rect x="35" y="29" width="10" height="9" rx="3" fill="#CBD5E1"/>
      {/* Tronco — barriga larga */}
      <path d="M22 38 Q7 68 9 103 Q11 128 22 138 Q32 146 40 146 Q48 146 58 138 Q69 128 71 103 Q73 68 58 38 Z"
            fill="#CBD5E1"/>
      {/* Braços */}
      <path d="M22 40 Q6 70 8 104 Q5 103 3 98 Q2 66 18 36 Z" fill="#CBD5E1"/>
      <path d="M58 40 Q74 70 72 104 Q75 103 77 98 Q78 66 62 36 Z" fill="#CBD5E1"/>
      {/* Pernas */}
      <rect x="22" y="144" width="14" height="43" rx="5" fill="#CBD5E1"/>
      <rect x="44" y="144" width="14" height="43" rx="5" fill="#CBD5E1"/>
      {/* Destaque gordura abdominal */}
      <ellipse cx="40" cy="86" rx="27" ry="29"
               fill="rgba(239,68,68,0.25)" stroke="rgba(239,68,68,0.45)" strokeWidth="1"/>
    </svg>
  )
}

function BodyGinoide() {
  return (
    <svg viewBox="0 0 80 195" className="w-full h-full" fill="none">
      {/* Cabeça */}
      <circle cx="40" cy="17" r="13" fill="#CBD5E1"/>
      {/* Pescoço */}
      <rect x="35" y="29" width="10" height="9" rx="3" fill="#CBD5E1"/>
      {/* Tronco — quadril largo */}
      <path d="M30 38 Q26 58 27 73 Q16 80 12 103 Q12 128 23 138 Q32 148 40 148
               Q48 148 57 138 Q68 128 68 103 Q64 80 53 73 Q54 58 50 38 Z"
            fill="#CBD5E1"/>
      {/* Braços */}
      <path d="M30 40 Q24 60 25 76 Q21 73 19 68 Q20 52 26 36 Z" fill="#CBD5E1"/>
      <path d="M50 40 Q56 60 55 76 Q59 73 61 68 Q60 52 54 36 Z" fill="#CBD5E1"/>
      {/* Pernas */}
      <rect x="19" y="146" width="16" height="41" rx="5" fill="#CBD5E1"/>
      <rect x="45" y="146" width="16" height="41" rx="5" fill="#CBD5E1"/>
      {/* Destaque gordura quadril/coxa */}
      <ellipse cx="40" cy="116" rx="24" ry="21"
               fill="rgba(34,197,94,0.25)" stroke="rgba(34,197,94,0.45)" strokeWidth="1"/>
    </svg>
  )
}

// ─── Componente ───────────────────────────────────────────────────────────────

export default function DistribuicaoGordura({ dados, onChange }: Props) {
  const selected = dados.distribuicaoGordura

  const opcoes = [
    { key: 'androide', label: 'Androide', Body: BodyAndroide },
    { key: 'ginoide',  label: 'Ginoide',  Body: BodyGinoide  },
  ]

  return (
    <section>
      <h2 className="text-lg font-semibold text-gray-900 mb-6">
        Distribuição de gordura corporal
      </h2>

      <div className="flex gap-4">
        {opcoes.map(({ key, label, Body }) => (
          <button
            key={key}
            onClick={() =>
              onChange({ distribuicaoGordura: selected === key ? null : key })
            }
            className={[
              'flex flex-col items-center gap-3 p-4 rounded-xl border-2',
              'w-40 transition-all hover:shadow-md active:scale-95',
              selected === key
                ? 'border-purple-500 bg-purple-50 shadow-sm'
                : 'border-gray-200 bg-gray-50 hover:border-gray-300',
            ].join(' ')}
          >
            <div className="w-24 h-36">
              <Body />
            </div>
            <span className={`text-sm font-medium ${
              selected === key ? 'text-purple-700' : 'text-gray-600'
            }`}>
              {label}
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}
