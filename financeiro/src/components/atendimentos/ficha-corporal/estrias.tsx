'use client'

import type { FichaCorporalData } from '@/app/atendimentos/[id]/page'

interface Props {
  dados:    FichaCorporalData
  onChange: (updates: Partial<FichaCorporalData>) => void
}

// ─── Tipos de estria ──────────────────────────────────────────────────────────

const TIPOS = [
  {
    key: 'rubra', label: 'Rubra (vermelha/roxa)',
    desc: 'Estrias recentes, de coloração avermelhada ou roxa, com processo inflamatório ativo.',
    color: '#ef4444',
    bgColor: 'rgba(239,68,68,0.08)',
  },
  {
    key: 'alba', label: 'Alba (branca/nacarada)',
    desc: 'Estrias antigas, cicatrizadas, de coloração branca ou prateada, sem inflamação.',
    color: '#94a3b8',
    bgColor: 'rgba(148,163,184,0.08)',
  },
  {
    key: 'mista', label: 'Mista',
    desc: 'Presença de estrias rubras e albas na mesma região.',
    color: '#a855f7',
    bgColor: 'rgba(168,85,247,0.08)',
  },
]

// ─── Componente ───────────────────────────────────────────────────────────────

export default function Estrias({ dados, onChange }: Props) {
  const tipo = dados.tipoEstria
  const obs  = dados.observacoesEstria ?? ''

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
        Estrias
      </h2>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 24 }}>
        {TIPOS.map(t => {
          const isActive = tipo === t.key
          return (
            <button
              key={t.key}
              onClick={() => onChange({ tipoEstria: tipo === t.key ? null : t.key })}
              style={{
                padding: '16px', borderRadius: 14,
                border: `2px solid ${isActive ? t.color : 'var(--border)'}`,
                background: isActive ? t.bgColor : 'var(--bg)',
                cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                transition: 'all 0.2s', display: 'flex', flexDirection: 'column', gap: 8,
                boxShadow: isActive ? `0 0 0 3px ${t.color}15` : 'none',
              }}
              onMouseEnter={e => { if (!isActive) e.currentTarget.style.borderColor = t.color }}
              onMouseLeave={e => { if (!isActive) e.currentTarget.style.borderColor = 'var(--border)' }}
            >
              {/* Dot + label */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 10, height: 10, borderRadius: 99, background: t.color, flexShrink: 0 }} />
                <span style={{ fontSize: '0.88rem', fontWeight: 800, color: isActive ? t.color : 'var(--text-main)' }}>
                  {t.label}
                </span>
              </div>
              <span style={{ fontSize: '0.72rem', fontWeight: 500, color: 'var(--text-muted)', lineHeight: 1.4 }}>
                {t.desc}
              </span>
            </button>
          )
        })}
      </div>

      {/* Observações */}
      <div>
        <label style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: 6, display: 'block' }}>
          Observações
        </label>
        <textarea
          value={obs}
          onChange={e => onChange({ observacoesEstria: e.target.value || null })}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder="Descreva localização, extensão e características das estrias..."
          rows={3}
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
