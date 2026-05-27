'use client'

import type { FichaCorporalData } from '@/app/atendimentos/[id]/page'

interface Props {
  dados:    FichaCorporalData
  onChange: (updates: Partial<FichaCorporalData>) => void
}

// ─── Ilustrações abdômen ──────────────────────────────────────────────────────

// Músculo reto: dois blocos lado a lado
// Negativo = sem espaço, Positivo = com espaço entre eles

function AbdomenBase({
  gap,
  children,
}: {
  gap:      number
  children?: React.ReactNode
}) {
  const cx = 50
  const w  = 22
  const lx = cx - gap / 2 - w   // left muscle x
  const rx = cx + gap / 2        // right muscle x

  return (
    <svg viewBox="0 0 100 120" className="w-full h-full" fill="none">
      {/* Silhueta do tronco */}
      <ellipse cx="50" cy="60" rx="40" ry="52" fill="#FDDDC0" stroke="#E8B898" strokeWidth="1"/>
      {/* Músculo esquerdo */}
      <rect x={lx} y="12" width={w} height="96" rx="8" fill="#D4906A" opacity=".55"/>
      {/* Músculo direito */}
      <rect x={rx} y="12" width={w} height="96" rx="8" fill="#D4906A" opacity=".55"/>
      {/* Intersecções tendíneas */}
      {[34, 56, 78].map(y => (
        <g key={y}>
          <line x1={lx} y1={y} x2={lx + w} y2={y} stroke="#C07050" strokeWidth=".8" opacity=".5"/>
          <line x1={rx} y1={y} x2={rx + w} y2={y} stroke="#C07050" strokeWidth=".8" opacity=".5"/>
        </g>
      ))}
      {/* Umbigo */}
      <circle cx="50" cy="62" r="3.5" fill="#C07050" opacity=".4"/>
      {children}
    </svg>
  )
}

function IlustraResultadoNegativo() {
  return (
    <AbdomenBase gap={0}>
      {/* Setas azuis apontando para o centro */}
      <g stroke="#4A90D9" strokeWidth="2" strokeLinecap="round">
        <line x1="10" y1="60" x2="26" y2="60"/>
        <path d="M24 56 L30 60 L24 64" fill="none"/>
        <line x1="90" y1="60" x2="74" y2="60"/>
        <path d="M76 56 L70 60 L76 64" fill="none"/>
      </g>
    </AbdomenBase>
  )
}

function IlustraResultadoPositivo() {
  return (
    <AbdomenBase gap={10}>
      {/* Setas azuis apontando para fora */}
      <g stroke="#4A90D9" strokeWidth="2" strokeLinecap="round">
        <line x1="39" y1="60" x2="26" y2="60"/>
        <path d="M28 56 L22 60 L28 64" fill="none"/>
        <line x1="61" y1="60" x2="74" y2="60"/>
        <path d="M72 56 L78 60 L72 64" fill="none"/>
      </g>
    </AbdomenBase>
  )
}

// ─── Ilustrações dos tipos de diástase ───────────────────────────────────────

// Mostra a região de separação destacada em amarelo/âmbar
function IlustraTipo({ tipo }: { tipo: 'a' | 'b' | 'c' | 'd' }) {
  const cx = 50
  const w  = 22
  const g  = 10
  const lx = cx - g / 2 - w
  const rx = cx + g / 2

  // Região destacada por tipo:
  // a = infraumbilical (baixo)
  // b = supraumbilical (alto)
  // c = completo
  // d = supraumbilical + lado esquerdo deslocado

  const highlight: Record<string, { y: number; h: number }> = {
    a: { y: 62, h: 46 },
    b: { y: 12, h: 50 },
    c: { y: 12, h: 96 },
    d: { y: 12, h: 50 },
  }

  const hl = highlight[tipo]

  return (
    <svg viewBox="0 0 100 120" className="w-full h-full" fill="none">
      {/* Silhueta */}
      <ellipse cx="50" cy="60" rx="40" ry="52" fill="#FDDDC0" stroke="#E8B898" strokeWidth="1"/>

      {/* Músculo esquerdo */}
      <rect x={tipo === 'd' ? lx - 4 : lx} y="12" width={w} height="96" rx="8"
            fill="#D4906A" opacity=".55"/>
      {/* Músculo direito */}
      <rect x={rx} y="12" width={w} height="96" rx="8" fill="#D4906A" opacity=".55"/>

      {/* Intersecções tendíneas */}
      {[34, 56, 78].map(y => (
        <g key={y}>
          <line x1={lx} y1={y} x2={lx + w} y2={y} stroke="#C07050" strokeWidth=".8" opacity=".4"/>
          <line x1={rx} y1={y} x2={rx + w} y2={y} stroke="#C07050" strokeWidth=".8" opacity=".4"/>
        </g>
      ))}

      {/* Região de separação destacada */}
      <rect
        x={tipo === 'd' ? cx - g / 2 + 4 : cx - g / 2}
        y={hl.y}
        width={g}
        height={hl.h}
        fill="#F59E0B"
        opacity=".7"
        rx="2"
      />

      {/* Umbigo */}
      <circle cx="50" cy="62" r="3.5" fill="#C07050" opacity=".4"/>
    </svg>
  )
}

// ─── Componente ───────────────────────────────────────────────────────────────

export default function TesteDiastase({ dados, onChange }: Props) {
  const resultado = dados.diasteseResultado
  const tipo      = dados.diasteseTipo

  return (
    <section>
      <h2 className="text-lg font-semibold text-gray-900 mb-6">
        Teste de diástase de reto abdominal
      </h2>

      {/* Negativo / Positivo */}
      <div className="flex gap-4 mb-10">
        {([
          { key: 'negativo', label: 'Negativo', Ilustra: IlustraResultadoNegativo },
          { key: 'positivo', label: 'Positivo', Ilustra: IlustraResultadoPositivo },
        ] as const).map(({ key, label, Ilustra }) => (
          <button
            key={key}
            onClick={() => onChange({ diasteseResultado: resultado === key ? null : key })}
            className={[
              'flex flex-col items-center gap-3 p-4 rounded-xl border-2 transition-all',
              'w-44 hover:shadow-md active:scale-95',
              resultado === key
                ? 'border-purple-500 bg-purple-50 shadow-sm'
                : 'border-gray-200 bg-gray-50 hover:border-gray-300',
            ].join(' ')}
          >
            <div className="w-full h-32">
              <Ilustra />
            </div>
            <span className={`text-sm font-semibold ${
              resultado === key ? 'text-purple-700' : 'text-gray-700'
            }`}>
              {label}
            </span>
          </button>
        ))}
      </div>

      {/* Tipo de diástase — só aparece se positivo */}
      {resultado === 'positivo' && (
        <div className="mb-8">
          <h3 className="text-base font-semibold text-gray-900 mb-4">
            Tipo de diástase de reto abdominal
          </h3>

          <div className="grid grid-cols-4 gap-3">
            {(['a', 'b', 'c', 'd'] as const).map(t => (
              <button
                key={t}
                onClick={() => onChange({ diasteseTipo: tipo === t ? null : t })}
                className={[
                  'flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all',
                  'hover:shadow-md active:scale-95',
                  tipo === t
                    ? 'border-purple-500 bg-purple-50 shadow-sm'
                    : 'border-gray-200 bg-gray-50 hover:border-gray-300',
                ].join(' ')}
              >
                <div className="w-full h-28">
                  <IlustraTipo tipo={t} />
                </div>
                <span className={`text-sm font-semibold uppercase ${
                  tipo === t ? 'text-purple-700' : 'text-gray-700'
                }`}>
                  Tipo {t.toUpperCase()}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Observações */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          Observações
        </label>
        <textarea
          rows={3}
          placeholder="Digite"
          value={dados.observacoesDiastese ?? ''}
          onChange={e => onChange({ observacoesDiastese: e.target.value })}
          className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm
                     focus:outline-none focus:ring-2 focus:ring-purple-100
                     focus:border-purple-400 placeholder-gray-400 resize-none
                     transition-colors"
        />
      </div>
    </section>
  )
}
