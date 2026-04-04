'use client';
import { useState, useEffect, createContext, useContext, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';

/* ═══════════════════════════════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════════════════════════════ */
export interface TourStep {
  /** CSS selector for the target element */
  target: string;
  /** Bold title in the tooltip */
  title: string;
  /** Description text */
  description: string;
}

interface PageTour {
  pageKey: string;
  steps: TourStep[];
}

/* ═══════════════════════════════════════════════════════════════════
   TOUR DATA — VENDAS section (pacotes, orcamento, pacientes)
   ═══════════════════════════════════════════════════════════════════ */
const TOUR_DATA: PageTour[] = [
  {
    pageKey: 'pacotes',
    steps: [
      {
        target: '[data-tour="vendas-novo-pacote"]',
        title: 'Criar Novo Pacote',
        description: 'Clique aqui para criar um novo pacote de serviços. Defina procedimentos, sessões, valor e condições de pagamento.',
      },
      {
        target: '[data-tour="vendas-kpis"]',
        title: 'Indicadores de Vendas',
        description: 'Acompanhe os KPIs: total de pacotes, ativos, concluídos, valor total vendido e quanto já foi recebido.',
      },
      {
        target: '[data-tour="vendas-filtros"]',
        title: 'Filtros de Status',
        description: 'Filtre os pacotes por status: Todos, Ativos, Concluídos ou Cancelados para encontrar rapidamente o que precisa.',
      },
      {
        target: '[data-tour="vendas-lista"]',
        title: 'Lista de Pacotes',
        description: 'Veja todos os pacotes listados com progresso de sessões, valores e ações. Clique em um pacote para gerenciá-lo.',
      },
    ],
  },
  {
    pageKey: 'pacotes-orcamento',
    steps: [
      {
        target: '[data-tour="orc-novo-cliente"]',
        title: 'Novo Cliente',
        description: 'Clique aqui para cadastrar um novo cliente com orçamento. Preencha os dados e gere a proposta.',
      },
      {
        target: '[data-tour="orc-busca"]',
        title: 'Busca Rápida',
        description: 'Busque clientes rapidamente digitando o nome ou CPF neste campo.',
      },
      {
        target: '[data-tour="orc-kpis"]',
        title: 'Indicadores de Orçamento',
        description: 'Veja o total de clientes, quantos estão em orçamento, vendas convertidas e o valor total.',
      },
      {
        target: '[data-tour="orc-tabela"]',
        title: 'Tabela de Clientes',
        description: 'Na tabela, veja todos os clientes. Use os botões de ação para editar, converter em venda ou excluir.',
      },
    ],
  },
  {
    pageKey: 'pacotes-pacientes',
    steps: [
      {
        target: '[data-tour="pac-kpis"]',
        title: 'Indicadores de Pacientes',
        description: 'Veja os totais: pacientes cadastrados, em orçamento, com vendas fechadas e o valor total somado.',
      },
      {
        target: '[data-tour="pac-busca"]',
        title: 'Busca de Pacientes',
        description: 'Busque pacientes por nome, telefone, email ou CPF neste campo de pesquisa.',
      },
      {
        target: '[data-tour="pac-lista"]',
        title: 'Lista de Pacientes',
        description: 'Clique em qualquer paciente para abrir a ficha completa. Selecione múltiplos para exclusão em lote.',
      },
    ],
  },
];

/* ═══════════════════════════════════════════════════════════════════
   STORAGE
   ═══════════════════════════════════════════════════════════════════ */
const STORAGE_KEY = 'virtuosa_tour_done';

function getDismissed(): Record<string, boolean> {
  if (typeof window === 'undefined') return {};
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; }
}

/* ═══════════════════════════════════════════════════════════════════
   CONTEXT
   ═══════════════════════════════════════════════════════════════════ */
interface TourContextType {
  startTour: (pageKey: string) => void;
  resetTour: (pageKey?: string) => void;
}

const TourContext = createContext<TourContextType>({
  startTour: () => {},
  resetTour: () => {},
});
export const useTour = () => useContext(TourContext);

/* ═══════════════════════════════════════════════════════════════════
   SPOTLIGHT OVERLAY — renders a dark overlay with a cutout around target
   ═══════════════════════════════════════════════════════════════════ */
function SpotlightOverlay({ rect, onClick }: { rect: DOMRect | null; onClick: () => void }) {
  if (!rect) return null;

  const pad = 8;
  const r = 14;
  const x = rect.left - pad;
  const y = rect.top - pad;
  const w = rect.width + pad * 2;
  const h = rect.height + pad * 2;

  return (
    <div
      onClick={onClick}
      style={{
        position: 'fixed', inset: 0, zIndex: 99998,
        pointerEvents: 'auto',
      }}
    >
      <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0 }}>
        <defs>
          <mask id="tour-mask">
            <rect width="100%" height="100%" fill="white" />
            <rect x={x} y={y} width={w} height={h} rx={r} ry={r} fill="black" />
          </mask>
        </defs>
        <rect width="100%" height="100%" fill="rgba(0,0,0,0.55)" mask="url(#tour-mask)" />
      </svg>
      {/* Spotlight border glow */}
      <div style={{
        position: 'absolute',
        left: x, top: y, width: w, height: h,
        borderRadius: r,
        boxShadow: '0 0 0 3px rgba(230,0,126,0.5), 0 0 20px rgba(230,0,126,0.2)',
        pointerEvents: 'none',
        transition: 'all 0.35s cubic-bezier(0.4,0,0.2,1)',
      }} />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   TOOLTIP — white card with connector dot
   ═══════════════════════════════════════════════════════════════════ */
function TourTooltip({
  step, stepIndex, totalSteps, rect,
  onNext, onSkip,
}: {
  step: TourStep;
  stepIndex: number;
  totalSteps: number;
  rect: DOMRect | null;
  onNext: () => void;
  onSkip: () => void;
}) {
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; placement: 'below' | 'above' }>({ top: 0, left: 0, placement: 'below' });

  useEffect(() => {
    if (!rect) return;
    const pad = 8;
    const tooltipW = 360;
    const tooltipH = 180;
    const gap = 18;

    // Determine if tooltip goes below or above
    const spaceBelow = window.innerHeight - (rect.bottom + pad);
    const placement = spaceBelow > tooltipH + gap + 30 ? 'below' : 'above';

    let top: number;
    if (placement === 'below') {
      top = rect.bottom + pad + gap;
    } else {
      top = rect.top - pad - gap - tooltipH;
    }

    // Center horizontally relative to target, but clamp to viewport
    let left = rect.left + rect.width / 2 - tooltipW / 2;
    left = Math.max(16, Math.min(left, window.innerWidth - tooltipW - 16));
    top = Math.max(16, top);

    setPos({ top, left, placement });
  }, [rect]);

  if (!rect) return null;

  const isLast = stepIndex === totalSteps - 1;
  const pad = 8;

  // Connector dot position
  const dotX = rect.left + rect.width / 2;
  const dotY = pos.placement === 'below' ? rect.bottom + pad + 4 : rect.top - pad - 4;

  return (
    <>
      {/* Connector dot */}
      <div style={{
        position: 'fixed',
        left: dotX - 6, top: dotY - 6,
        width: 12, height: 12,
        borderRadius: '50%',
        background: '#fff',
        boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
        zIndex: 100001,
        transition: 'all 0.35s cubic-bezier(0.4,0,0.2,1)',
      }} />

      {/* Tooltip card */}
      <div
        ref={tooltipRef}
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'fixed',
          top: pos.top, left: pos.left,
          width: 360, maxWidth: 'calc(100vw - 32px)',
          background: '#fff',
          borderRadius: 16,
          boxShadow: '0 16px 48px rgba(0,0,0,0.2), 0 0 0 1px rgba(0,0,0,0.05)',
          zIndex: 100001,
          padding: '22px 24px 18px',
          animation: 'tourFadeIn 0.3s ease',
          transition: 'top 0.35s cubic-bezier(0.4,0,0.2,1), left 0.35s cubic-bezier(0.4,0,0.2,1)',
        }}
      >
        <style>{`
          @keyframes tourFadeIn {
            from { opacity: 0; transform: translateY(8px); }
            to   { opacity: 1; transform: translateY(0); }
          }
        `}</style>

        {/* Title */}
        <div style={{ fontWeight: 800, fontSize: '1rem', color: '#1a1a2e', marginBottom: 8, lineHeight: 1.3 }}>
          {step.title}
        </div>

        {/* Description */}
        <div style={{ fontSize: '0.88rem', color: '#555', lineHeight: 1.6, marginBottom: 20, fontWeight: 500 }}>
          {step.description}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button
            onClick={onSkip}
            style={{
              padding: '8px 22px', borderRadius: 20,
              border: '2px solid #e6007e', background: 'transparent',
              color: '#e6007e', fontWeight: 700, fontSize: '0.82rem',
              cursor: 'pointer', fontFamily: 'inherit',
              transition: 'all 0.15s',
            }}
          >
            Pular
          </button>

          <button
            onClick={onNext}
            style={{
              padding: '8px 22px', borderRadius: 20,
              border: 'none',
              background: '#e6007e',
              color: '#fff', fontWeight: 700, fontSize: '0.82rem',
              cursor: 'pointer', fontFamily: 'inherit',
              boxShadow: '0 2px 12px rgba(230,0,126,0.3)',
              transition: 'all 0.15s',
            }}
          >
            {isLast ? 'OK' : `Avançar (${stepIndex + 1}/${totalSteps})`}
          </button>
        </div>
      </div>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   TOUR ENGINE — manages active tour state
   ═══════════════════════════════════════════════════════════════════ */
function TourEngine({
  steps, onComplete, onSkip,
}: {
  steps: TourStep[];
  onComplete: () => void;
  onSkip: () => void;
}) {
  const [stepIndex, setStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);

  const currentStep = steps[stepIndex];

  // Find and measure target element
  useEffect(() => {
    if (!currentStep) return;

    const findTarget = () => {
      const el = document.querySelector(currentStep.target) as HTMLElement | null;
      if (el) {
        const rect = el.getBoundingClientRect();
        setTargetRect(rect);

        // Ensure element is visible
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });

        // Elevate target above overlay
        el.style.position = 'relative';
        el.style.zIndex = '99999';
        el.style.transition = 'all 0.3s ease';

        return el;
      }
      return null;
    };

    // Small delay for scroll + DOM settling
    const timer = setTimeout(() => {
      const el = findTarget();
      if (!el) {
        // Retry once more after a longer delay
        setTimeout(findTarget, 500);
      }
    }, 150);

    return () => {
      clearTimeout(timer);
      // Reset previous target z-index
      const el = document.querySelector(currentStep.target) as HTMLElement | null;
      if (el) {
        el.style.zIndex = '';
        el.style.position = '';
      }
    };
  }, [stepIndex, currentStep]);

  // Update rect on resize/scroll
  useEffect(() => {
    if (!currentStep) return;

    const updateRect = () => {
      const el = document.querySelector(currentStep.target) as HTMLElement | null;
      if (el) {
        setTargetRect(el.getBoundingClientRect());
      }
    };

    window.addEventListener('resize', updateRect);
    window.addEventListener('scroll', updateRect, true);

    return () => {
      window.removeEventListener('resize', updateRect);
      window.removeEventListener('scroll', updateRect, true);
    };
  }, [currentStep]);

  const handleNext = () => {
    // Clean up current target
    const el = document.querySelector(currentStep.target) as HTMLElement | null;
    if (el) {
      el.style.zIndex = '';
      el.style.position = '';
    }

    if (stepIndex < steps.length - 1) {
      setStepIndex(stepIndex + 1);
    } else {
      onComplete();
    }
  };

  if (!currentStep) return null;

  return createPortal(
    <>
      <SpotlightOverlay rect={targetRect} onClick={onSkip} />
      <TourTooltip
        step={currentStep}
        stepIndex={stepIndex}
        totalSteps={steps.length}
        rect={targetRect}
        onNext={handleNext}
        onSkip={onSkip}
      />
    </>,
    document.body
  );
}

/* ═══════════════════════════════════════════════════════════════════
   PROVIDER — wraps the app
   ═══════════════════════════════════════════════════════════════════ */
export function TourProvider({ children }: { children: React.ReactNode }) {
  const [activeSteps, setActiveSteps] = useState<TourStep[] | null>(null);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setDismissed(getDismissed());
  }, []);

  const startTour = useCallback((pageKey: string) => {
    if (dismissed[pageKey]) return;
    const tour = TOUR_DATA.find(t => t.pageKey === pageKey);
    if (!tour || tour.steps.length === 0) return;

    // Wait for page elements to render
    setTimeout(() => {
      setActiveKey(pageKey);
      setActiveSteps(tour.steps);
    }, 800);
  }, [dismissed]);

  const resetTour = useCallback((pageKey?: string) => {
    if (pageKey) {
      const next = { ...dismissed };
      delete next[pageKey];
      setDismissed(next);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      // Re-trigger
      const tour = TOUR_DATA.find(t => t.pageKey === pageKey);
      if (tour) {
        setTimeout(() => {
          setActiveKey(pageKey);
          setActiveSteps(tour.steps);
        }, 400);
      }
    } else {
      setDismissed({});
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [dismissed]);

  const handleComplete = useCallback(() => {
    if (activeKey) {
      const next = { ...dismissed, [activeKey]: true };
      setDismissed(next);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    }
    setActiveSteps(null);
    setActiveKey(null);
  }, [activeKey, dismissed]);

  const handleSkip = useCallback(() => {
    handleComplete();
  }, [handleComplete]);

  return (
    <TourContext.Provider value={{ startTour, resetTour }}>
      {children}
      {activeSteps && (
        <TourEngine
          steps={activeSteps}
          onComplete={handleComplete}
          onSkip={handleSkip}
        />
      )}
    </TourContext.Provider>
  );
}
