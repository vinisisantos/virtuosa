'use client'

import type { FichaCorporalData } from '@/app/atendimentos/[id]/page'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface DobraduraData {
  m1:      number | null
  m2:      number | null
  m3:      number | null
  mediana: number
}

type AdipoData = Record<string, DobraduraData>

interface Props {
  dados:    FichaCorporalData
  onChange: (updates: Partial<FichaCorporalData>) => void
}

// ─── Dobras ───────────────────────────────────────────────────────────────────

const DOBRAS = [
  { key: 'tricipital',     label: 'Tricipital',     desc: 'Parte posterior do braço, no ponto médio entre o acrômio e o olécrano.' },
  { key: 'subescapular',   label: 'Subescapular',   desc: 'Abaixo da ponta inferior da escápula, diagonal a 45°.' },
  { key: 'bicipital',      label: 'Bicipital',      desc: 'Parte anterior do braço, linha medial, mesmo nível do tricipital.' },
  { key: 'axilar',         label: 'Axilar',         desc: 'Linha axilar média, na altura do processo xifoide.' },
  { key: 'iliaca',         label: 'Ilíaca',         desc: 'Logo acima da crista ilíaca, na linha axilar anterior.' },
  { key: 'supraespinhal',  label: 'Supraespinhal',  desc: 'Cruzamento da linha axilar anterior com a crista ilíaca.' },
  { key: 'abdominal',      label: 'Abdominal',      desc: '2 cm à direita da cicatriz umbilical, dobra vertical.' },
  { key: 'coxa',           label: 'Coxa',           desc: 'Ponto médio entre o ligamento inguinal e borda superior da patela.' },
  { key: 'panturrilha',    label: 'Panturrilha',    desc: 'Maior perímetro da panturrilha, face medial.' },
]

const PROTOCOLOS = [
  { value: '',          label: 'Selecione' },
  { value: 'petroski',  label: 'Petróski' },
  { value: 'pollock3',  label: 'Pollock 3 dobras' },
  { value: 'pollock7',  label: 'Pollock 7 dobras' },
  { value: 'guedes',    label: 'Guedes' },
  { value: 'jackson',   label: 'Jackson & Pollock' },
]

function calcMediana(m1: number | null, m2: number | null, m3: number | null): number {
  const vals = [m1, m2, m3].filter(v => v !== null) as number[]
  if (vals.length === 0) return 0
  vals.sort((a, b) => a - b)
  return vals.length === 3 ? vals[1] : +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2)
}

// ─── Componente ───────────────────────────────────────────────────────────────

export default function Adipometria({ dados, onChange }: Props) {
  const protocolo = dados.adipometriaProtocolo ?? ''
  const adipo     = (dados.adipometriaData ?? {}) as AdipoData

  function handleProtocolo(value: string) {
    onChange({ adipometriaProtocolo: value || null })
  }

  function handleMedida(dobraKey: string, field: 'm1' | 'm2' | 'm3', value: string) {
    const v = value === '' ? null : parseFloat(value)
    const row = adipo[dobraKey] ?? { m1: null, m2: null, m3: null, mediana: 0 }
    const updated = { ...row, [field]: v }
    updated.mediana = calcMediana(updated.m1, updated.m2, updated.m3)

    const next: AdipoData = { ...adipo, [dobraKey]: updated }
    onChange({ adipometriaData: next as unknown as Record<string, unknown> })
  }

  const selectS: React.CSSProperties = {
    padding: '12px 16px', borderRadius: 12,
    border: '2px solid var(--border)', fontSize: '0.88rem', fontWeight: 600,
    background: 'var(--bg)', color: 'var(--text-main)', fontFamily: 'inherit',
    outline: 'none', cursor: 'pointer', minWidth: 200,
    WebkitAppearance: 'none',
    appearance: 'none' as const,
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='%23999'%3E%3Cpath d='M7 10l5 5 5-5z'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 12px center',
    paddingRight: 36,
  }

  const cellInputS: React.CSSProperties = {
    width: '100%', padding: '10px 12px', borderRadius: 10,
    border: '2px solid var(--border)', fontSize: '0.85rem', fontWeight: 600,
    background: 'var(--bg)', color: 'var(--text-main)', fontFamily: 'inherit',
    outline: 'none', textAlign: 'center', transition: 'border-color 0.2s, box-shadow 0.2s',
  }

  const thS: React.CSSProperties = {
    fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)',
    textTransform: 'uppercase', letterSpacing: '0.5px', padding: '10px 8px',
    textAlign: 'center', whiteSpace: 'nowrap',
  }

  function handleFocus(e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) {
    e.target.style.borderColor = 'var(--primary)'
    e.target.style.boxShadow = '0 0 0 3px rgba(230,0,126,0.1)'
  }
  function handleBlur(e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) {
    e.target.style.borderColor = 'var(--border)'
    e.target.style.boxShadow = 'none'
  }

  const protocoloInfo = protocolo
    ? PROTOCOLOS.find(p => p.value === protocolo)
    : null

  return (
    <section>
      <h2 style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-main)', margin: '0 0 24px' }}>
        Adipometria
      </h2>

      {/* Protocolo */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 28, flexWrap: 'wrap' }}>
        <div>
          <label style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 6, textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>
            Protocolo
          </label>
          <select
            value={protocolo}
            onChange={e => handleProtocolo(e.target.value)}
            onFocus={handleFocus as unknown as React.FocusEventHandler<HTMLSelectElement>}
            onBlur={handleBlur as unknown as React.FocusEventHandler<HTMLSelectElement>}
            style={selectS}
          >
            {PROTOCOLOS.map(p => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </div>

        {protocoloInfo && (
          <div style={{
            flex: 1, minWidth: 240, padding: '12px 16px', borderRadius: 12,
            background: 'var(--bg)', border: '1px solid var(--border)',
            fontSize: '0.82rem', fontWeight: 500, color: 'var(--text-muted)',
            display: 'flex', alignItems: 'center', gap: 8, alignSelf: 'flex-end',
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--primary)', flexShrink: 0 }}>info</span>
            Utilize o Protocolo de {protocoloInfo.label} para calcular o percentual de gordura.
          </div>
        )}
      </div>

      {/* Tabela de dobras */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '0 4px' }}>
          <thead>
            <tr>
              <th style={{ ...thS, textAlign: 'left', paddingLeft: 0, width: 160 }}>Dobra</th>
              <th style={thS}>1ª Medida</th>
              <th style={thS}>2ª Medida</th>
              <th style={thS}>3ª Medida</th>
              <th style={{ ...thS, width: 100 }}>Mediana</th>
            </tr>
          </thead>
          <tbody>
            {DOBRAS.map(dobra => {
              const row = adipo[dobra.key] ?? { m1: null, m2: null, m3: null, mediana: 0 }
              return (
                <tr key={dobra.key}>
                  <td style={{ padding: '6px 8px 6px 0', verticalAlign: 'middle' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-main)' }}>
                        {dobra.label}
                      </span>
                      <span
                        className="material-symbols-outlined"
                        title={dobra.desc}
                        style={{ fontSize: 14, color: 'var(--text-muted)', cursor: 'help', opacity: 0.6 }}
                      >help</span>
                    </div>
                  </td>
                  {(['m1', 'm2', 'm3'] as const).map(field => (
                    <td key={field} style={{ padding: '4px 4px' }}>
                      <input
                        type="number"
                        placeholder="mm"
                        value={row[field] ?? ''}
                        onChange={e => handleMedida(dobra.key, field, e.target.value)}
                        onFocus={handleFocus}
                        onBlur={handleBlur}
                        style={cellInputS}
                      />
                    </td>
                  ))}
                  <td style={{ padding: '4px 8px', textAlign: 'center' }}>
                    <span style={{
                      fontSize: '0.88rem', fontWeight: 700,
                      color: row.mediana > 0 ? 'var(--text-main)' : 'var(--text-muted)',
                    }}>
                      {row.mediana.toFixed(2)} mm
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Soma das medianas */}
      <div style={{
        marginTop: 16, padding: '12px 16px', borderRadius: 12,
        background: 'var(--bg)', border: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-muted)' }}>
          Soma das medianas
        </span>
        <span style={{ fontSize: '1rem', fontWeight: 900, color: 'var(--primary)' }}>
          {Object.values(adipo).reduce((sum, row) => sum + (row?.mediana ?? 0), 0).toFixed(2)} mm
        </span>
      </div>
    </section>
  )
}
