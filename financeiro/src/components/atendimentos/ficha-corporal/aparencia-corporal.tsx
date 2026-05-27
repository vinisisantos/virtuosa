'use client'

import { useRef } from 'react'
import type { FichaCorporalData } from '@/app/atendimentos/[id]/page'

interface Props {
  dados:    FichaCorporalData
  onChange: (updates: Partial<FichaCorporalData>) => void
}

// ─── Silhueta paramétrica (8 tipos, 1 = muito magro, 8 = obeso) ───────────────

function BodyFigura({ n }: { n: number }) {
  const t    = (n - 1) / 7                         // 0 → 1
  const lerp = (a: number, b: number) => a + (b - a) * t
  const cx   = 30

  const shW  = lerp(8,  15)   // meia-largura dos ombros
  const blW  = lerp(8,  22)   // meia-largura da barriga
  const hpW  = lerp(8,  17)   // meia-largura do quadril
  const lgW  = lerp(5,  9.5)  // meia-largura da perna
  const hY   = 80             // Y do quadril
  const lBtm = 130            // Y do pé

  // Pernas simétricas com gap fixo de 4px
  const llX  = cx - lgW * 2 - 2   // left leg X
  const rlX  = cx + 2              // right leg X

  return (
    <svg viewBox="0 0 60 140" fill="none" className="w-full h-full">
      {/* Cabeça */}
      <circle cx={cx} cy={11} r={10} fill="#CBD5E1"/>
      {/* Pescoço */}
      <rect x={cx - 4} y={21} width="8" height="8" rx="3" fill="#CBD5E1"/>

      {/* Braço esquerdo */}
      <path
        d={`M${cx - shW},30
            C${cx - shW - 6},46 ${cx - shW - 3},58 ${cx - shW},65
            L${cx - shW + 5},63
            C${cx - shW + 2},56 ${cx - shW + 2},44 ${cx - shW + 4},30 Z`}
        fill="#B0BEC5"
      />

      {/* Braço direito */}
      <path
        d={`M${cx + shW},30
            C${cx + shW + 6},46 ${cx + shW + 3},58 ${cx + shW},65
            L${cx + shW - 5},63
            C${cx + shW - 2},56 ${cx + shW - 2},44 ${cx + shW - 4},30 Z`}
        fill="#B0BEC5"
      />

      {/* Tronco (camiseta) */}
      <path
        d={`M${cx - shW},30
            Q${cx - blW},63 ${cx - hpW},${hY}
            L${cx + hpW},${hY}
            Q${cx + blW},63 ${cx + shW},30 Z`}
        fill="#B0BEC5"
      />

      {/* Shorts */}
      <path
        d={`M${cx - hpW},${hY - 6}
            Q${cx - hpW - 2},${hY + 6} ${llX + lgW * 2},${hY + 6}
            L${llX + lgW * 2},${hY - 4}
            Z`}
        fill="#8DA8B8"
      />
      <path
        d={`M${cx + hpW},${hY - 6}
            Q${cx + hpW + 2},${hY + 6} ${rlX},${hY + 6}
            L${rlX},${hY - 4}
            Z`}
        fill="#8DA8B8"
      />
      <path
        d={`M${llX + lgW * 2},${hY - 4}
            L${llX + lgW * 2},${hY + 6}
            Q${cx},${hY + 14} ${rlX},${hY + 6}
            L${rlX},${hY - 4} Z`}
        fill="#94A3B8"
      />

      {/* Perna esquerda */}
      <rect
        x={llX} y={hY + 5}
        width={lgW * 2} height={lBtm - hY - 5}
        rx={lgW} fill="#CBD5E1"
      />

      {/* Perna direita */}
      <rect
        x={rlX} y={hY + 5}
        width={lgW * 2} height={lBtm - hY - 5}
        rx={lgW} fill="#CBD5E1"
      />
    </svg>
  )
}

// ─── Carrossel reutilizável ───────────────────────────────────────────────────

function CarrosselSilhuetas({
  value,
  onChange,
}: {
  value?:   number | null
  onChange: (n: number) => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)

  function scroll(dir: -1 | 1) {
    scrollRef.current?.scrollBy({ left: dir * 180, behavior: 'smooth' })
  }

  return (
    <div className="flex items-center gap-2">

      {/* Seta esquerda */}
      <button
        onClick={() => scroll(-1)}
        className="flex-shrink-0 w-9 h-9 rounded-full border border-gray-200 bg-white
                   shadow-sm flex items-center justify-center text-gray-400
                   hover:text-gray-600 hover:border-gray-300 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/>
        </svg>
      </button>

      {/* Faixa scrollável */}
      <div ref={scrollRef} className="flex-1 overflow-x-hidden">
        <div className="flex gap-3 py-2 px-1">
          {Array.from({ length: 8 }, (_, i) => i + 1).map(n => {
            const isSelected = value === n
            return (
              <button
                key={n}
                onClick={() => onChange(n)}
                className={[
                  'flex flex-col items-center gap-2 rounded-xl border-2 flex-shrink-0',
                  'transition-all duration-200 hover:shadow-md active:scale-95',
                  isSelected
                    ? 'border-purple-500 bg-purple-50 shadow-sm px-3 py-3 w-28'
                    : 'border-gray-200 bg-gray-50 hover:border-gray-300 px-2 py-2 w-20',
                ].join(' ')}
              >
                <div className={`w-full transition-all duration-200 ${
                  isSelected ? 'h-28' : 'h-20'
                }`}>
                  <BodyFigura n={n} />
                </div>
                <span className={`text-sm font-semibold tabular-nums ${
                  isSelected ? 'text-purple-700' : 'text-gray-500'
                }`}>
                  {n}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Seta direita */}
      <button
        onClick={() => scroll(1)}
        className="flex-shrink-0 w-9 h-9 rounded-full border border-gray-200 bg-white
                   shadow-sm flex items-center justify-center text-gray-400
                   hover:text-gray-600 hover:border-gray-300 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/>
        </svg>
      </button>

    </div>
  )
}

// ─── Componente exportado ─────────────────────────────────────────────────────

export default function AparenciaCorporal({ dados, onChange }: Props) {
  return (
    <>
      {/* Aparência percebida */}
      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-1">
          Aparência percebida
        </h2>
        <p className="text-sm text-gray-400 mb-5">
          Como o paciente enxerga seu corpo atualmente.
        </p>
        <CarrosselSilhuetas
          value={dados.aparenciaPercebida}
          onChange={n => onChange({
            aparenciaPercebida: dados.aparenciaPercebida === n ? undefined : n,
          })}
        />
      </section>

      <hr className="border-gray-100" />

      {/* Aparência desejada */}
      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-1">
          Aparência desejada
        </h2>
        <p className="text-sm text-gray-400 mb-5">
          Como o paciente gostaria que seu corpo ficasse.
        </p>
        <CarrosselSilhuetas
          value={dados.aparenciaDesejada}
          onChange={n => onChange({
            aparenciaDesejada: dados.aparenciaDesejada === n ? undefined : n,
          })}
        />
      </section>

      <hr className="border-gray-100" />

      {/* Observações gerais da ficha */}
      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Observações gerais
        </h2>
        <textarea
          rows={4}
          placeholder="Digite observações adicionais sobre o atendimento corporal..."
          value={dados.observacoes ?? ''}
          onChange={e => onChange({ observacoes: e.target.value })}
          className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm
                     focus:outline-none focus:ring-2 focus:ring-purple-100
                     focus:border-purple-400 placeholder-gray-400 resize-none
                     transition-colors"
        />
      </section>
    </>
  )
}
