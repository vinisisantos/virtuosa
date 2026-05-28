'use client'

import type { FichaCorporalData } from '@/app/atendimentos/[id]/page'

interface Props {
  dados:    FichaCorporalData
  onChange: (updates: Partial<FichaCorporalData>) => void
}

// ─── Classificação do IMC ─────────────────────────────────────────────────────

function getIMCInfo(imc: number | null | undefined) {
  if (!imc) return { label: '—', risk: '—', color: 'var(--text-muted)' }
  if (imc < 18.5) return { label: 'Baixo peso',         risk: 'Elevado',      color: '#f59e0b' }
  if (imc < 25)   return { label: 'Eutrófico',           risk: 'Normal',       color: '#10b981' }
  if (imc < 30)   return { label: 'Sobrepeso',           risk: 'Aumentado',    color: '#f59e0b' }
  if (imc < 35)   return { label: 'Obesidade grau I',    risk: 'Moderado',     color: '#f97316' }
  if (imc < 40)   return { label: 'Obesidade grau II',   risk: 'Grave',        color: '#ef4444' }
                   return { label: 'Obesidade grau III',  risk: 'Muito grave',  color: '#dc2626' }
}

// ─── Silhueta paramétrica ─────────────────────────────────────────────────────

function BodySilhouette({ imc }: { imc: number | null | undefined }) {
  const value = imc ?? 22
  const t = Math.max(0, Math.min(1, (value - 15) / 30))
  const lerp = (a: number, b: number) => a + (b - a) * t

  const shoulderW = lerp(14, 22)
  const bellyW    = lerp(12, 32)
  const hipW      = lerp(14, 26)
  const legW      = lerp(7, 14)
  const cx        = 60

  return (
    <svg viewBox="0 0 120 280" style={{ width: '100%', height: '100%' }} fill="none">
      {/* Cabeça */}
      <circle cx={cx} cy="28" r="16" fill="#D4A98C"/>
      <ellipse cx={cx} cy="16" rx="14" ry="10" fill="#6B4C3B"/>
      {/* Pescoço */}
      <rect x={cx - 7} y="43" width="14" height="12" rx="3" fill="#D4A98C"/>
      {/* Tronco */}
      <path d={`M${cx - shoulderW} 55 Q${cx - bellyW} 110 ${cx - hipW} 195 Q${cx - hipW + 5} 210 ${cx} 210 Q${cx + hipW - 5} 210 ${cx + hipW} 195 Q${cx + bellyW} 110 ${cx + shoulderW} 55 Z`} fill="#D4A98C"/>
      {/* Braços */}
      <path d={`M${cx - shoulderW} 58 Q${cx - shoulderW - 8} 90 ${cx - shoulderW - 10} 140 L${cx - shoulderW - 4} 142 Q${cx - shoulderW - 2} 100 ${cx - shoulderW + 5} 62 Z`} fill="#C99A80"/>
      <path d={`M${cx + shoulderW} 58 Q${cx + shoulderW + 8} 90 ${cx + shoulderW + 10} 140 L${cx + shoulderW + 4} 142 Q${cx + shoulderW + 2} 100 ${cx + shoulderW - 5} 62 Z`} fill="#C99A80"/>
      {/* Mãos */}
      <ellipse cx={cx - shoulderW - 10} cy="145" rx="5" ry="6" fill="#D4A98C"/>
      <ellipse cx={cx + shoulderW + 10} cy="145" rx="5" ry="6" fill="#D4A98C"/>
      {/* Pernas */}
      <path d={`M${cx - legW - 2} 208 Q${cx - legW - 3} 240 ${cx - legW - 4} 265 Q${cx - legW - 4} 272 ${cx - legW + 2} 275 L${cx - 2} 275 Q${cx - 1} 270 ${cx - 3} 258 Q${cx - 4} 240 ${cx - 4} 210 Z`} fill="#C99A80"/>
      <path d={`M${cx + legW + 2} 208 Q${cx + legW + 3} 240 ${cx + legW + 4} 265 Q${cx + legW + 4} 272 ${cx + legW - 2} 275 L${cx + 2} 275 Q${cx + 1} 270 ${cx + 3} 258 Q${cx + 4} 240 ${cx + 4} 210 Z`} fill="#C99A80"/>
    </svg>
  )
}

// ─── Componente ───────────────────────────────────────────────────────────────

export default function CalculoIMC({ dados, onChange }: Props) {
  const peso   = dados.peso   ?? null
  const altura = dados.altura ?? null
  const imc    = (peso && altura) ? +(peso / ((altura / 100) ** 2)).toFixed(1) : null
  const info   = getIMCInfo(imc)

  const inputWrapperS: React.CSSProperties = {
    position: 'relative', display: 'flex', alignItems: 'center',
  }

  const inputS: React.CSSProperties = {
    width: '100%', padding: '12px 50px 12px 16px', borderRadius: 12,
    border: '2px solid var(--border)', fontSize: '0.9rem', fontWeight: 600,
    background: 'var(--bg)', color: 'var(--text-main)', fontFamily: 'inherit',
    outline: 'none', transition: 'border-color 0.2s, box-shadow 0.2s',
  }

  const suffixS: React.CSSProperties = {
    position: 'absolute', right: 0, top: 0, bottom: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: 44, borderRadius: '0 12px 12px 0',
    background: 'var(--bg)', borderLeft: '1px solid var(--border)',
    fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)',
    pointerEvents: 'none',
  }

  const labelS: React.CSSProperties = {
    fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: 6,
  }

  const metricRowS: React.CSSProperties = {
    display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4,
  }

  function handleFocus(e: React.FocusEvent<HTMLInputElement>) {
    e.target.style.borderColor = 'var(--primary)'
    e.target.style.boxShadow = '0 0 0 3px rgba(230,0,126,0.1)'
  }
  function handleBlur(e: React.FocusEvent<HTMLInputElement>) {
    e.target.style.borderColor = 'var(--border)'
    e.target.style.boxShadow = 'none'
  }

  return (
    <section>
      <h2 style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-main)', margin: '0 0 24px' }}>
        Cálculo de IMC
      </h2>

      <div style={{ display: 'flex', gap: 40, alignItems: 'flex-start' }}>
        {/* Lado esquerdo — inputs + resultados */}
        <div style={{ flex: '1 1 0', minWidth: 0 }}>

          {/* Peso */}
          <div style={{ marginBottom: 16 }}>
            <label style={labelS}>Peso</label>
            <div style={inputWrapperS}>
              <input
                type="number"
                placeholder="kg"
                value={peso ?? ''}
                onChange={e => {
                  const v = e.target.value ? parseFloat(e.target.value) : null
                  onChange({ peso: v })
                }}
                onFocus={handleFocus}
                onBlur={handleBlur}
                style={inputS}
              />
              <div style={suffixS}>kg</div>
            </div>
          </div>

          {/* Altura */}
          <div style={{ marginBottom: 20 }}>
            <label style={labelS}>Altura</label>
            <div style={inputWrapperS}>
              <input
                type="number"
                placeholder="cm"
                value={altura ?? ''}
                onChange={e => {
                  const v = e.target.value ? parseFloat(e.target.value) : null
                  onChange({ altura: v })
                }}
                onFocus={handleFocus}
                onBlur={handleBlur}
                style={inputS}
              />
              <div style={suffixS}>cm</div>
            </div>
          </div>

          {/* Resultados */}
          <div style={{
            padding: '16px 20px', borderRadius: 12,
            background: 'var(--bg)', border: '1px solid var(--border)',
          }}>
            <div style={metricRowS}>
              <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)' }}>IMC:</span>
              <span style={{ fontSize: '1.1rem', fontWeight: 900, color: info.color }}>
                {imc ?? '—'}
              </span>
            </div>
            <div style={metricRowS}>
              <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)' }}>Tipo de obesidade:</span>
              <span style={{ fontSize: '0.88rem', fontWeight: 700, color: info.color }}>
                {info.label}
              </span>
            </div>
            <div style={metricRowS}>
              <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)' }}>Grau de risco:</span>
              <span style={{ fontSize: '0.88rem', fontWeight: 700, color: info.color }}>
                {info.risk}
              </span>
            </div>
          </div>
        </div>

        {/* Lado direito — silhueta */}
        <div style={{
          width: 160, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{ width: 130, height: 240 }}>
            <BodySilhouette imc={imc} />
          </div>
        </div>
      </div>
    </section>
  )
}
