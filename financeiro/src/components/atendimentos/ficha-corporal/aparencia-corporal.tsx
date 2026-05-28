'use client'

import { useRef } from 'react'
import type { FichaCorporalData } from '@/app/atendimentos/[id]/page'

interface Props {
  dados:    FichaCorporalData
  onChange: (updates: Partial<FichaCorporalData>) => void
}

// ─── Silhueta paramétrica (1 = muito magro, 8 = obeso) ────────────────────────

function BodyFigura({ n }: { n: number }) {
  const t   = (n - 1) / 7
  const lerp = (a: number, b: number) => a + (b - a) * t
  const cx  = 30

  const shW = lerp(8,  15)
  const blW = lerp(8,  22)
  const hpW = lerp(8,  17)
  const lgW = lerp(5,  9.5)

  return (
    <svg viewBox="0 0 60 130" style={{ width: '100%', height: '100%' }} fill="none">
      <circle cx={cx} cy="13" r="8" fill="#D4A98C"/>
      <rect x={cx - 3} y="20" width="6" height="6" rx="2" fill="#D4A98C"/>
      <path d={`M${cx - shW} 26 Q${cx - blW} 55 ${cx - hpW} 90 Q${cx - hpW + 3} 96 ${cx} 96 Q${cx + hpW - 3} 96 ${cx + hpW} 90 Q${cx + blW} 55 ${cx + shW} 26 Z`} fill="#D4A98C"/>
      <path d={`M${cx - shW} 28 Q${cx - shW - 4} 45 ${cx - shW - 5} 65 L${cx - shW - 2} 66 Q${cx - shW - 1} 48 ${cx - shW + 3} 30 Z`} fill="#C99A80"/>
      <path d={`M${cx + shW} 28 Q${cx + shW + 4} 45 ${cx + shW + 5} 65 L${cx + shW + 2} 66 Q${cx + shW + 1} 48 ${cx + shW - 3} 30 Z`} fill="#C99A80"/>
      <path d={`M${cx - lgW} 94 Q${cx - lgW - 1} 110 ${cx - lgW - 1} 122 L${cx - 1} 122 Q${cx - 2} 110 ${cx - 2} 96 Z`} fill="#C99A80"/>
      <path d={`M${cx + lgW} 94 Q${cx + lgW + 1} 110 ${cx + lgW + 1} 122 L${cx + 1} 122 Q${cx + 2} 110 ${cx + 2} 96 Z`} fill="#C99A80"/>
    </svg>
  )
}

// ─── Slider visual ────────────────────────────────────────────────────────────

function FigureSlider({
  label,
  value,
  onSelect,
}: {
  label: string
  value: number | null | undefined
  onSelect: (v: number) => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)

  return (
    <div style={{ marginBottom: 28 }}>
      <label style={{
        fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-main)',
        marginBottom: 12, display: 'block',
      }}>
        {label}
      </label>

      <div
        ref={scrollRef}
        style={{
          display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 8,
          scrollSnapType: 'x mandatory',
        }}
      >
        {Array.from({ length: 8 }, (_, i) => i + 1).map(n => {
          const isActive = value === n
          return (
            <button
              key={n}
              onClick={() => onSelect(n)}
              style={{
                flex: '0 0 auto', width: 72, display: 'flex', flexDirection: 'column',
                alignItems: 'center', gap: 4, padding: '12px 4px 8px',
                borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit',
                border: `2px solid ${isActive ? 'var(--primary)' : 'var(--border)'}`,
                background: isActive ? 'var(--primary-light)' : 'var(--bg)',
                transition: 'all 0.15s', scrollSnapAlign: 'start',
                boxShadow: isActive ? '0 0 0 3px rgba(230,0,126,0.08)' : 'none',
              }}
              onMouseEnter={e => { if (!isActive) e.currentTarget.style.borderColor = 'var(--primary)' }}
              onMouseLeave={e => { if (!isActive) e.currentTarget.style.borderColor = 'var(--border)' }}
            >
              <div style={{ width: 40, height: 80 }}>
                <BodyFigura n={n} />
              </div>
              <span style={{
                fontSize: '0.72rem', fontWeight: isActive ? 800 : 600,
                color: isActive ? 'var(--primary)' : 'var(--text-muted)',
              }}>
                {n}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── Componente ───────────────────────────────────────────────────────────────

export default function AparenciaCorporal({ dados, onChange }: Props) {
  const obs = dados.observacoes ?? ''

  function handleFocus(e: React.FocusEvent<HTMLTextAreaElement>) {
    e.target.style.borderColor = 'var(--primary)'
    e.target.style.boxShadow = '0 0 0 3px rgba(230,0,126,0.1)'
  }
  function handleBlur(e: React.FocusEvent<HTMLTextAreaElement>) {
    e.target.style.borderColor = 'var(--border)'
    e.target.style.boxShadow = 'none'
  }

  return (
    <section>
      <h2 style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-main)', margin: '0 0 24px' }}>
        Aparência corporal
      </h2>

      <FigureSlider
        label="Aparência percebida"
        value={dados.aparenciaPercebida}
        onSelect={v => onChange({ aparenciaPercebida: v })}
      />

      <FigureSlider
        label="Aparência desejada"
        value={dados.aparenciaDesejada}
        onSelect={v => onChange({ aparenciaDesejada: v })}
      />

      {/* Observações gerais */}
      <div>
        <label style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: 6, display: 'block' }}>
          Observações gerais
        </label>
        <textarea
          value={obs}
          onChange={e => onChange({ observacoes: e.target.value || null })}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder="Observações complementares sobre a ficha corporal..."
          rows={4}
          style={{
            width: '100%', padding: '12px 16px', borderRadius: 12,
            border: '2px solid var(--border)', fontSize: '0.88rem', fontWeight: 500,
            background: 'var(--bg)', color: 'var(--text-main)', fontFamily: 'inherit',
            outline: 'none', resize: 'vertical', transition: 'border-color 0.2s, box-shadow 0.2s',
            lineHeight: 1.5,
          }}
        />
      </div>
    </section>
  )
}
