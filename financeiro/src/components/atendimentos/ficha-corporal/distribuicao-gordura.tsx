'use client'

import type { FichaCorporalData } from '@/app/atendimentos/[id]/page'

interface Props {
  dados:    FichaCorporalData
  onChange: (updates: Partial<FichaCorporalData>) => void
}

// ─── Silhuetas SVG premium ────────────────────────────────────────────────────

function BodyAndroide() {
  return (
    <svg viewBox="0 0 120 280" style={{ width: '100%', height: '100%' }} fill="none">
      {/* Cabeça */}
      <circle cx="60" cy="28" r="18" fill="#D4A98C"/>
      <ellipse cx="60" cy="14" rx="16" ry="10" fill="#6B4C3B"/>
      {/* Pescoço */}
      <rect x="52" y="45" width="16" height="14" rx="4" fill="#D4A98C"/>
      {/* Tronco — formato androide (barriga larga) */}
      <path d="M35 59 Q15 110 18 160 Q20 190 35 205 Q48 215 60 215 Q72 215 85 205 Q100 190 102 160 Q105 110 85 59 Z" fill="#D4A98C"/>
      {/* Zona de acúmulo — barriga */}
      <ellipse cx="60" cy="135" rx="32" ry="38" fill="#E88B8B" opacity="0.45"/>
      {/* Braços */}
      <path d="M35 62 Q22 80 18 120 Q16 140 20 155 L28 152 Q28 135 30 118 Q33 85 40 65 Z" fill="#C99A80"/>
      <path d="M85 62 Q98 80 102 120 Q104 140 100 155 L92 152 Q92 135 90 118 Q87 85 80 65 Z" fill="#C99A80"/>
      {/* Mãos */}
      <ellipse cx="19" cy="158" rx="6" ry="7" fill="#D4A98C"/>
      <ellipse cx="101" cy="158" rx="6" ry="7" fill="#D4A98C"/>
      {/* Pernas */}
      <path d="M42 212 Q38 240 36 260 Q35 270 40 275 L55 275 Q55 270 52 258 Q50 240 52 215 Z" fill="#C99A80"/>
      <path d="M78 212 Q82 240 84 260 Q85 270 80 275 L65 275 Q65 270 68 258 Q70 240 68 215 Z" fill="#C99A80"/>
    </svg>
  )
}

function BodyGinoide() {
  return (
    <svg viewBox="0 0 120 280" style={{ width: '100%', height: '100%' }} fill="none">
      {/* Cabeça */}
      <circle cx="60" cy="28" r="18" fill="#D4A98C"/>
      <ellipse cx="60" cy="14" rx="18" ry="12" fill="#6B4C3B"/>
      {/* Pescoço */}
      <rect x="52" y="45" width="16" height="14" rx="4" fill="#D4A98C"/>
      {/* Tronco — formato ginoide (quadril largo) */}
      <path d="M40 59 Q30 85 28 110 Q26 135 30 155 Q35 180 25 210 Q35 220 60 220 Q85 220 95 210 Q85 180 90 155 Q94 135 92 110 Q90 85 80 59 Z" fill="#D4A98C"/>
      {/* Zona de acúmulo — quadril/coxas */}
      <ellipse cx="60" cy="185" rx="30" ry="28" fill="#8BC9A0" opacity="0.45"/>
      {/* Braços */}
      <path d="M40 62 Q27 80 23 115 Q21 135 24 150 L32 147 Q32 130 34 113 Q37 85 44 65 Z" fill="#C99A80"/>
      <path d="M80 62 Q93 80 97 115 Q99 135 96 150 L88 147 Q88 130 86 113 Q83 85 76 65 Z" fill="#C99A80"/>
      {/* Mãos */}
      <ellipse cx="23" cy="153" rx="6" ry="7" fill="#D4A98C"/>
      <ellipse cx="97" cy="153" rx="6" ry="7" fill="#D4A98C"/>
      {/* Pernas */}
      <path d="M38 218 Q34 240 32 260 Q31 270 36 275 L52 275 Q52 270 49 258 Q47 240 48 220 Z" fill="#C99A80"/>
      <path d="M82 218 Q86 240 88 260 Q89 270 84 275 L68 275 Q68 270 71 258 Q73 240 72 220 Z" fill="#C99A80"/>
    </svg>
  )
}

// ─── Componente ───────────────────────────────────────────────────────────────

export default function DistribuicaoGordura({ dados, onChange }: Props) {
  const selected = dados.distribuicaoGordura

  const cardBase: React.CSSProperties = {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
    padding: '20px 16px', borderRadius: 14, cursor: 'pointer',
    transition: 'all 0.2s ease', border: '2px solid transparent',
    background: 'var(--bg)', minWidth: 140, flex: '1 1 0',
  }

  return (
    <section>
      <h2 style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-main)', margin: '0 0 20px' }}>
        Distribuição de gordura corporal
      </h2>

      <div style={{ display: 'flex', gap: 16 }}>
        {([
          { key: 'androide', label: 'Androide', Body: BodyAndroide },
          { key: 'ginoide',  label: 'Ginoide',  Body: BodyGinoide  },
        ] as const).map(({ key, label, Body }) => {
          const isActive = selected === key
          return (
            <button
              key={key}
              onClick={() => onChange({ distribuicaoGordura: selected === key ? null : key })}
              style={{
                ...cardBase,
                borderColor: isActive ? 'var(--primary)' : 'var(--border)',
                background: isActive ? 'var(--primary-light)' : 'var(--bg)',
                boxShadow: isActive ? '0 0 0 3px rgba(230,0,126,0.08)' : 'none',
                fontFamily: 'inherit',
              }}
              onMouseEnter={e => { if (!isActive) { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,0.06)' } }}
              onMouseLeave={e => { if (!isActive) { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none' } }}
            >
              <div style={{ width: 100, height: 160 }}>
                <Body />
              </div>
              <span style={{
                fontSize: '0.88rem', fontWeight: isActive ? 800 : 600,
                color: isActive ? 'var(--primary)' : 'var(--text-main)',
              }}>
                {label}
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
