'use client'

import type { FichaCorporalData } from '@/app/atendimentos/[id]/page'

interface Props {
  dados:    FichaCorporalData
  onChange: (updates: Partial<FichaCorporalData>) => void
}

// ─── Circunferências ──────────────────────────────────────────────────────────

const MEDIDAS = [
  { key: 'braco',           label: 'Braço',            desc: 'Circunferência do braço relaxado, ponto médio entre o acrômio e o olécrano.' },
  { key: 'bracoContraido',  label: 'Braço Contraído',  desc: 'Circunferência do braço em contração máxima.' },
  { key: 'torax',           label: 'Tórax',            desc: 'Nível dos mamilos, ao final de uma expiração normal.' },
  { key: 'cintura',         label: 'Cintura',          desc: 'Menor circunferência entre a última costela e a crista ilíaca.' },
  { key: 'quadril',         label: 'Quadril',          desc: 'Maior protuberância glútea.' },
  { key: 'coxaMedial',      label: 'Coxa medial',     desc: 'Ponto médio entre o trocânter maior e a borda superior da patela.' },
  { key: 'coxaProximal',    label: 'Coxa proximal',   desc: 'Logo abaixo da prega glútea.' },
  { key: 'panturrilha',     label: 'Panturrilha',     desc: 'Maior perímetro da panturrilha.' },
  { key: 'antebraco',       label: 'Antebraço',       desc: 'Maior perímetro do antebraço.' },
  { key: 'pescoco',         label: 'Pescoço',         desc: 'Logo acima da proeminência laríngea.' },
]

// ─── Componente ───────────────────────────────────────────────────────────────

export default function Perimetria({ dados, onChange }: Props) {
  const periData = (dados.perimetriaData ?? {}) as Record<string, number | null>

  function handleChange(key: string, value: string) {
    const v = value === '' ? null : parseFloat(value)
    const next = { ...periData, [key]: v }
    onChange({ perimetriaData: next as unknown as Record<string, unknown> })
  }

  const inputWrapperS: React.CSSProperties = {
    position: 'relative', display: 'flex', alignItems: 'center',
  }

  const inputS: React.CSSProperties = {
    width: '100%', padding: '12px 50px 12px 16px', borderRadius: 12,
    border: '2px solid var(--border)', fontSize: '0.88rem', fontWeight: 600,
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
        Perimetria
      </h2>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px 24px' }}>
        {MEDIDAS.map(m => (
          <div key={m.key}>
            <label style={{
              display: 'flex', alignItems: 'center', gap: 6,
              fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: 6,
            }}>
              {m.label}
              <span
                className="material-symbols-outlined"
                title={m.desc}
                style={{ fontSize: 14, color: 'var(--text-muted)', cursor: 'help', opacity: 0.6 }}
              >help</span>
            </label>
            <div style={inputWrapperS}>
              <input
                type="number"
                placeholder="0,00"
                value={periData[m.key] ?? ''}
                onChange={e => handleChange(m.key, e.target.value)}
                onFocus={handleFocus}
                onBlur={handleBlur}
                style={inputS}
              />
              <div style={suffixS}>mm</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
