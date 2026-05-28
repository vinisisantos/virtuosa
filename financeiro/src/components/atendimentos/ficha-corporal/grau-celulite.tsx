'use client'

import type { FichaCorporalData } from '@/app/atendimentos/[id]/page'

interface Props {
  dados:    FichaCorporalData
  onChange: (updates: Partial<FichaCorporalData>) => void
}

// ─── Dados dos graus ──────────────────────────────────────────────────────────

const GRAUS = [
  {
    grau: 1, label: 'Grau I',
    desc: 'Sem alterações na superfície da pele. Celulite visível apenas com compressão.',
    color: '#10b981',
  },
  {
    grau: 2, label: 'Grau II',
    desc: 'Ondulações visíveis em pé ou ao contrair os músculos, sem compressão.',
    color: '#f59e0b',
  },
  {
    grau: 3, label: 'Grau III',
    desc: 'Aspecto "casca de laranja" visível em qualquer posição. Nódulos palpáveis.',
    color: '#f97316',
  },
  {
    grau: 4, label: 'Grau IV',
    desc: 'Nódulos grandes e dolorosos, fibrose e comprometimento da circulação local.',
    color: '#ef4444',
  },
]

// ─── Ilustração de corte da pele ──────────────────────────────────────────────

function IlustraCelulite({ grau }: { grau: 1 | 2 | 3 | 4 }) {
  const configs = {
    1: { surfacePath: 'M0,28 Q20,26 40,28 Q60,30 80,28', fatColor: '#F5C4A0', undulations: 0 },
    2: { surfacePath: 'M0,27 Q18,24 25,30 Q38,26 52,30 Q66,26 80,27', fatColor: '#F0A878', undulations: 2 },
    3: { surfacePath: 'M0,26 Q12,20 20,32 Q30,22 40,30 Q50,20 60,32 Q70,22 80,26', fatColor: '#E89060', undulations: 4 },
    4: { surfacePath: 'M0,24 Q8,16 15,34 Q22,18 30,34 Q38,14 45,34 Q52,18 60,34 Q68,16 75,32 Q80,20 80,24', fatColor: '#DC7850', undulations: 6 },
  }
  const cfg = configs[grau]

  return (
    <svg viewBox="0 0 80 60" style={{ width: '100%', height: 48, display: 'block' }}>
      {/* Fundo — tecido adiposo */}
      <rect x="0" y="24" width="80" height="36" rx="2" fill={cfg.fatColor} opacity="0.3"/>
      {/* Superfície da pele */}
      <path d={cfg.surfacePath} stroke={cfg.fatColor} strokeWidth="3" fill="none" strokeLinecap="round"/>
      {/* Septos fibrosos */}
      {Array.from({ length: cfg.undulations }).map((_, i) => (
        <line key={i} x1={15 + i * 15} y1={30} x2={15 + i * 15} y2={45} stroke={cfg.fatColor} strokeWidth="1.5" opacity="0.5"/>
      ))}
    </svg>
  )
}

// ─── Componente ───────────────────────────────────────────────────────────────

export default function GrauCelulite({ dados, onChange }: Props) {
  const selected = dados.grauCelulite

  return (
    <section>
      <h2 style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-main)', margin: '0 0 24px' }}>
        Grau de celulite
      </h2>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        {GRAUS.map(g => {
          const isActive = selected === g.grau
          return (
            <button
              key={g.grau}
              onClick={() => onChange({ grauCelulite: selected === g.grau ? null : g.grau })}
              style={{
                padding: '16px 12px', borderRadius: 14,
                border: `2px solid ${isActive ? g.color : 'var(--border)'}`,
                background: isActive ? `${g.color}10` : 'var(--bg)',
                cursor: 'pointer', fontFamily: 'inherit', textAlign: 'center',
                transition: 'all 0.2s', display: 'flex', flexDirection: 'column',
                alignItems: 'center', gap: 10,
                boxShadow: isActive ? `0 0 0 3px ${g.color}18` : 'none',
              }}
              onMouseEnter={e => { if (!isActive) e.currentTarget.style.borderColor = g.color }}
              onMouseLeave={e => { if (!isActive) e.currentTarget.style.borderColor = 'var(--border)' }}
            >
              <IlustraCelulite grau={g.grau as 1 | 2 | 3 | 4} />
              <span style={{ fontSize: '0.85rem', fontWeight: 800, color: isActive ? g.color : 'var(--text-main)' }}>
                {g.label}
              </span>
              <span style={{ fontSize: '0.72rem', fontWeight: 500, color: 'var(--text-muted)', lineHeight: 1.3 }}>
                {g.desc}
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
