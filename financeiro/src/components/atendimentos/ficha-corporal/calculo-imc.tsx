'use client'

import type { FichaCorporalData } from '@/app/atendimentos/[id]/page'

interface Props {
  dados:    FichaCorporalData
  onChange: (updates: Partial<FichaCorporalData>) => void
}

// ─── Cálculo e classificação ──────────────────────────────────────────────────

function calcularIMC(peso: number, alturaEmCm: number): number {
  const alturaM = alturaEmCm / 100
  return Math.round((peso / (alturaM * alturaM)) * 10) / 10
}

function classificarIMC(imc: number): { label: string; cor: string } {
  if (imc < 18.5) return { label: 'Abaixo do peso',     cor: 'text-blue-600'   }
  if (imc < 25.0) return { label: 'Peso normal',        cor: 'text-green-600'  }
  if (imc < 30.0) return { label: 'Sobrepeso',          cor: 'text-yellow-600' }
  if (imc < 35.0) return { label: 'Obesidade grau I',   cor: 'text-orange-500' }
  if (imc < 40.0) return { label: 'Obesidade grau II',  cor: 'text-red-500'    }
  return                   { label: 'Obesidade grau III', cor: 'text-red-700'   }
}

// ─── Figura corporal decorativa ───────────────────────────────────────────────

function FiguraCorporal() {
  return (
    <svg viewBox="0 0 100 240" className="w-full h-full" fill="none">
      {/* Cabeça */}
      <circle cx="50" cy="22" r="18" fill="#E2E8F0"/>
      {/* Pescoço */}
      <rect x="44" y="38" width="12" height="12" rx="4" fill="#E2E8F0"/>
      {/* Camiseta */}
      <path d="M28 50 Q18 80 20 130 Q38 138 50 138 Q62 138 80 130 Q82 80 72 50 Z"
            fill="#CBD5E1"/>
      {/* Shorts */}
      <path d="M26 130 Q36 140 50 140 Q64 140 74 130 Q78 148 72 158 Q62 164 50 164
               Q38 164 28 158 Q22 148 26 130Z"
            fill="#94A3B8"/>
      {/* Braços */}
      <path d="M28 52 Q14 82 16 118 L12 116 Q10 78 24 48 Z" fill="#CBD5E1"/>
      <path d="M72 52 Q86 82 84 118 L88 116 Q90 78 76 48 Z" fill="#CBD5E1"/>
      {/* Pernas */}
      <rect x="27" y="162" width="18" height="65" rx="7" fill="#E2E8F0"/>
      <rect x="55" y="162" width="18" height="65" rx="7" fill="#E2E8F0"/>
    </svg>
  )
}

// ─── Campo com sufixo ─────────────────────────────────────────────────────────

function CampoMedida({
  label,
  value,
  placeholder,
  sufixo,
  step,
  onChange,
}: {
  label:       string
  value:       number | null | undefined
  placeholder: string
  sufixo:      string
  step:        string
  onChange:    (v: string) => void
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">
        {label}
      </label>
      <div className="relative max-w-xs">
        <input
          type="number"
          min="0"
          step={step}
          placeholder={placeholder}
          value={value ?? ''}
          onChange={e => onChange(e.target.value)}
          className="w-full px-3 py-2.5 pr-12 border border-gray-300 rounded-lg text-sm
                     focus:outline-none focus:ring-2 focus:ring-purple-100 focus:border-purple-400
                     placeholder-gray-400 transition-colors"
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2
                         text-xs text-gray-400 font-medium pointer-events-none">
          {sufixo}
        </span>
      </div>
    </div>
  )
}

// ─── Componente ───────────────────────────────────────────────────────────────

export default function CalculoIMC({ dados, onChange }: Props) {

  function handlePesoChange(valor: string) {
    const peso = valor ? parseFloat(valor) : null
    const imc  = peso && dados.altura
      ? calcularIMC(peso, dados.altura)
      : null
    onChange({ peso, imc: imc ?? undefined })
  }

  function handleAlturaChange(valor: string) {
    const altura = valor ? parseFloat(valor) : null
    const imc    = dados.peso && altura
      ? calcularIMC(dados.peso, altura)
      : null
    onChange({ altura, imc: imc ?? undefined })
  }

  const imc  = dados.imc
  const info = imc ? classificarIMC(imc) : null

  return (
    <section>
      <h2 className="text-lg font-semibold text-gray-900 mb-6">
        Cálculo de IMC
      </h2>

      <div className="flex items-start gap-12">

        {/* Campos de entrada */}
        <div className="flex-1 space-y-4">
          <CampoMedida
            label="Peso"
            value={dados.peso}
            placeholder="kg"
            sufixo="kg"
            step="0.1"
            onChange={handlePesoChange}
          />
          <CampoMedida
            label="Altura"
            value={dados.altura}
            placeholder="cm"
            sufixo="cm"
            step="1"
            onChange={handleAlturaChange}
          />

          {/* Resultado */}
          <div className="pt-1 flex items-baseline gap-2">
            <span className="text-sm text-gray-600 font-medium">IMC:</span>
            {imc ? (
              <>
                <span className="text-sm font-bold text-gray-900">{imc}</span>
                {info && (
                  <span className={`text-xs font-medium ${info.cor}`}>
                    — {info.label}
                  </span>
                )}
              </>
            ) : (
              <span className="text-sm text-gray-400">—</span>
            )}
          </div>
        </div>

        {/* Figura decorativa */}
        <div className="w-28 h-52 flex-shrink-0 opacity-80">
          <FiguraCorporal />
        </div>

      </div>
    </section>
  )
}
