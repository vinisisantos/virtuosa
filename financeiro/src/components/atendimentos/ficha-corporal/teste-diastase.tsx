'use client'

import type { FichaCorporalData } from '@/app/atendimentos/[id]/page'

interface Props {
  dados:    FichaCorporalData
  onChange: (updates: Partial<FichaCorporalData>) => void
}

// ─── Resultados possíveis ─────────────────────────────────────────────────────

const RESULTADOS = [
  { key: 'negativo', label: 'Negativo',   desc: 'Sem separação da musculatura.', color: '#10b981', icon: 'check_circle' },
  { key: 'positivo', label: 'Positivo',   desc: 'Separação identificada na linha alba.', color: '#ef4444', icon: 'warning' },
]

const TIPOS_DIASTASE = [
  { key: 'supraumbilical',   label: 'Supraumbilical',   desc: 'Acima do umbigo' },
  { key: 'infraumbilical',   label: 'Infraumbilical',   desc: 'Abaixo do umbigo' },
  { key: 'periumbilical',    label: 'Periumbilical',    desc: 'Ao redor do umbigo' },
  { key: 'total',            label: 'Total',            desc: 'Toda a extensão da linha alba' },
]

// ─── Componente ───────────────────────────────────────────────────────────────

export default function TesteDiastase({ dados, onChange }: Props) {
  const resultado = dados.diasteseResultado
  const tipo      = dados.diasteseTipo
  const obs       = dados.observacoesDiastese ?? ''

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
        Teste de diástase
      </h2>

      {/* Resultado */}
      <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.5px', display: 'block', marginBottom: 10 }}>
        Resultado
      </label>
      <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
        {RESULTADOS.map(r => {
          const isActive = resultado === r.key
          return (
            <button
              key={r.key}
              onClick={() => onChange({ diasteseResultado: resultado === r.key ? null : r.key })}
              style={{
                flex: '1 1 0', padding: '16px', borderRadius: 14,
                border: `2px solid ${isActive ? r.color : 'var(--border)'}`,
                background: isActive ? `${r.color}10` : 'var(--bg)',
                cursor: 'pointer', fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', gap: 12,
                transition: 'all 0.2s',
                boxShadow: isActive ? `0 0 0 3px ${r.color}18` : 'none',
              }}
              onMouseEnter={e => { if (!isActive) e.currentTarget.style.borderColor = r.color }}
              onMouseLeave={e => { if (!isActive) e.currentTarget.style.borderColor = 'var(--border)' }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 22, color: isActive ? r.color : 'var(--text-muted)' }}>{r.icon}</span>
              <div>
                <div style={{ fontSize: '0.88rem', fontWeight: 800, color: isActive ? r.color : 'var(--text-main)' }}>
                  {r.label}
                </div>
                <div style={{ fontSize: '0.72rem', fontWeight: 500, color: 'var(--text-muted)' }}>
                  {r.desc}
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {/* Tipo — só se positivo */}
      {resultado === 'positivo' && (
        <>
          <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.5px', display: 'block', marginBottom: 10 }}>
            Localização
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 24 }}>
            {TIPOS_DIASTASE.map(t => {
              const isActive = tipo === t.key
              return (
                <button
                  key={t.key}
                  onClick={() => onChange({ diasteseTipo: tipo === t.key ? null : t.key })}
                  style={{
                    padding: '12px 10px', borderRadius: 12,
                    border: `2px solid ${isActive ? 'var(--primary)' : 'var(--border)'}`,
                    background: isActive ? 'var(--primary-light)' : 'var(--bg)',
                    cursor: 'pointer', fontFamily: 'inherit', textAlign: 'center',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={e => { if (!isActive) e.currentTarget.style.borderColor = 'var(--primary)' }}
                  onMouseLeave={e => { if (!isActive) e.currentTarget.style.borderColor = 'var(--border)' }}
                >
                  <div style={{ fontSize: '0.82rem', fontWeight: 700, color: isActive ? 'var(--primary)' : 'var(--text-main)' }}>
                    {t.label}
                  </div>
                  <div style={{ fontSize: '0.68rem', fontWeight: 500, color: 'var(--text-muted)', marginTop: 2 }}>
                    {t.desc}
                  </div>
                </button>
              )
            })}
          </div>
        </>
      )}

      {/* Observações */}
      <div>
        <label style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: 6, display: 'block' }}>
          Observações
        </label>
        <textarea
          value={obs}
          onChange={e => onChange({ observacoesDiastese: e.target.value || null })}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder="Medida em dedos ou centímetros, profundidade, localização exata..."
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
