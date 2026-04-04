'use client';
import { useState, useEffect, createContext, useContext, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';

/* ═══════════════════════════════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════════════════════════════ */
export interface TourStep {
  target: string;
  title: string;
  description: string;
  icon?: string;
}

interface PageTour {
  pageKey: string;
  label: string;
  steps: TourStep[];
}

/* ═══════════════════════════════════════════════════════════════════
   TOUR DATA — ALL PAGES
   ═══════════════════════════════════════════════════════════════════ */
const TOUR_DATA: PageTour[] = [
  /* ── DASHBOARD ── */
  {
    pageKey: 'dashboard',
    label: 'DASHBOARD',
    steps: [
      { target: '[data-tour="dash-filtros"]', title: 'Painel de Controle', icon: 'tune', description: 'Use os filtros de mês, ano e unidade para personalizar a visualização dos seus dados financeiros.' },
      { target: '[data-tour="dash-kpis"]', title: 'KPIs Financeiros', icon: 'monitoring', description: 'Acompanhe Faturamento, Custos, Lucro e Margem em tempo real. Os sparklines mostram a tendência mensal.' },
      { target: '[data-tour="dash-meta"]', title: 'Meta de Faturamento', icon: 'flag', description: 'Veja o progresso da meta do mês. A barra muda de cor conforme o atingimento: vermelho, rosa ou verde.' },
      { target: '[data-tour="dash-evolucao"]', title: 'Evolução Mensal', icon: 'show_chart', description: 'Gráfico de linha mostrando faturamento vs custos ao longo dos meses. Passe o mouse para ver detalhes.' },
      { target: '[data-tour="dash-rankings"]', title: 'Rankings', icon: 'leaderboard', description: 'Veja os procedimentos mais vendidos e os top clientes. Use a busca e filtros por unidade.' },
    ],
  },

  /* ── AGENDA ── */
  {
    pageKey: 'agenda',
    label: 'AGENDA',
    steps: [
      { target: '[data-tour="agenda-busca"]', title: 'Busca de Clientes', icon: 'search', description: 'Busque rapidamente por nome do cliente para encontrar agendamentos.' },
      { target: '[data-tour="agenda-views"]', title: 'Modos de Visualização', icon: 'view_comfy', description: 'Alterne entre Lista, Dia, Semana e Mês para ver seus agendamentos de diferentes formas.' },
      { target: '[data-tour="agenda-nav"]', title: 'Navegação de Data', icon: 'calendar_month', description: 'Use as setas para navegar entre datas e o botão para criar um novo agendamento.' },
      { target: '[data-tour="agenda-sidebar"]', title: 'Filtros Laterais', icon: 'filter_list', description: 'Filtre agendamentos por unidade, profissional, status e procedimento. Inclui o mini calendário para navegar.' },
    ],
  },

  /* ── VENDAS (Pacotes) ── */
  {
    pageKey: 'pacotes',
    label: 'VENDAS',
    steps: [
      { target: '[data-tour="vendas-novo-pacote"]', title: 'Criar Novo Pacote', icon: 'add_circle', description: 'Clique aqui para criar um novo pacote de serviços. Defina procedimentos, sessões, valor e condições de pagamento.' },
      { target: '[data-tour="vendas-kpis"]', title: 'Indicadores de Vendas', icon: 'monitoring', description: 'Acompanhe os KPIs: total de pacotes, ativos, concluídos, valor total vendido e quanto já foi recebido.' },
      { target: '[data-tour="vendas-filtros"]', title: 'Filtros de Status', icon: 'filter_list', description: 'Filtre os pacotes por status: Todos, Ativos, Concluídos ou Cancelados para encontrar rapidamente o que precisa.' },
      { target: '[data-tour="vendas-lista"]', title: 'Lista de Pacotes', icon: 'inventory_2', description: 'Veja todos os pacotes listados com progresso de sessões, valores e ações. Clique em um pacote para gerenciá-lo.' },
    ],
  },

  /* ── ORÇAMENTO ── */
  {
    pageKey: 'pacotes-orcamento',
    label: 'ORÇAMENTO',
    steps: [
      { target: '[data-tour="orc-novo-cliente"]', title: 'Novo Cliente', icon: 'person_add', description: 'Clique aqui para cadastrar um novo cliente com orçamento. Preencha os dados e gere a proposta.' },
      { target: '[data-tour="orc-busca"]', title: 'Busca Rápida', icon: 'search', description: 'Busque clientes rapidamente digitando o nome ou CPF neste campo.' },
      { target: '[data-tour="orc-kpis"]', title: 'Indicadores de Orçamento', icon: 'monitoring', description: 'Veja o total de clientes, quantos estão em orçamento, vendas convertidas e o valor total.' },
      { target: '[data-tour="orc-tabela"]', title: 'Tabela de Clientes', icon: 'table_view', description: 'Na tabela, veja todos os clientes. Use os botões de ação para editar, converter em venda ou excluir.' },
    ],
  },

  /* ── PACIENTES ── */
  {
    pageKey: 'pacotes-pacientes',
    label: 'PACIENTES',
    steps: [
      { target: '[data-tour="pac-kpis"]', title: 'Indicadores de Pacientes', icon: 'monitoring', description: 'Veja os totais: pacientes cadastrados, em orçamento, com vendas fechadas e o valor total somado.' },
      { target: '[data-tour="pac-busca"]', title: 'Busca de Pacientes', icon: 'search', description: 'Busque pacientes por nome, telefone, email ou CPF neste campo de pesquisa.' },
      { target: '[data-tour="pac-lista"]', title: 'Lista de Pacientes', icon: 'group', description: 'Clique em qualquer paciente para abrir a ficha completa. Selecione múltiplos para exclusão em lote.' },
    ],
  },

  /* ── CRM / PIPELINE ── */
  {
    pageKey: 'clientes',
    label: 'CRM',
    steps: [
      { target: '[data-tour="crm-filtros"]', title: 'Filtros de Pipeline', icon: 'filter_list', description: 'Filtre leads por unidade e busque por nome, telefone ou email para encontrar rapidamente.' },
      { target: '[data-tour="crm-kpis"]', title: 'Indicadores do CRM', icon: 'monitoring', description: 'Visualize total de leads, conversões, novos clientes e o funil completo do seu pipeline.' },
      { target: '[data-tour="crm-pipeline"]', title: 'Pipeline de Vendas', icon: 'view_kanban', description: 'Arraste os cards entre as colunas para mover leads pelo funil: Novo → Contato → Orçamento → Fechado → Perdido.' },
    ],
  },

  /* ── PAGAMENTOS ── */
  {
    pageKey: 'financeiro',
    label: 'PAGAMENTOS',
    steps: [
      { target: '[data-tour="pag-novo"]', title: 'Novo Pagamento', icon: 'add_card', description: 'Registre um novo pagamento com cliente, valor, forma de pagamento, parcelas e data de vencimento.' },
      { target: '[data-tour="pag-kpis"]', title: 'Indicadores de Pagamento', icon: 'monitoring', description: 'Acompanhe o total recebido, valores pendentes, atrasados e a quantidade de registros.' },
      { target: '[data-tour="pag-filtros"]', title: 'Filtros de Status', icon: 'filter_list', description: 'Filtre pagamentos entre Todos, Pendente, Pago, Atrasado ou Cancelado.' },
      { target: '[data-tour="pag-lista"]', title: 'Lista de Pagamentos', icon: 'payments', description: 'Veja todos os pagamentos com status, método, parcela e ações. Confirme recebimentos diretamente.' },
    ],
  },

  /* ── ESTOQUE ── */
  {
    pageKey: 'estoque',
    label: 'ESTOQUE',
    steps: [
      { target: '[data-tour="est-novo"]', title: 'Novo Item', icon: 'add_circle', description: 'Cadastre um novo produto ou insumo no estoque com categoria, quantidade mínima e custo unitário.' },
      { target: '[data-tour="est-kpis"]', title: 'Indicadores de Estoque', icon: 'monitoring', description: 'Veja tipos de itens, total em estoque, valor total e alertas de estoque baixo.' },
      { target: '[data-tour="est-filtros"]', title: 'Filtros', icon: 'filter_list', description: 'Filtre por unidade e categoria para encontrar itens específicos.' },
      { target: '[data-tour="est-grid"]', title: 'Cards de Estoque', icon: 'inventory', description: 'Cada card mostra quantidade, status e ações. Registre entradas e saídas diretamente.' },
    ],
  },

  /* ── CONTRATOS ── */
  {
    pageKey: 'contratos',
    label: 'CONTRATOS',
    steps: [
      { target: '[data-tour="cont-novo"]', title: 'Novo Contrato', icon: 'note_add', description: 'Gere um contrato digital selecionando o modelo, cliente e preenchendo os dados do serviço.' },
      { target: '[data-tour="cont-kpis"]', title: 'Indicadores', icon: 'monitoring', description: 'Acompanhe o total de contratos gerados, assinados, pendentes e expirados.' },
      { target: '[data-tour="cont-lista"]', title: 'Lista de Contratos', icon: 'description', description: 'Veja todos os contratos com status e ações. Clique para visualizar, baixar ou excluir.' },
    ],
  },

  /* ── CANCELAMENTOS ── */
  {
    pageKey: 'cancelamentos',
    label: 'CANCELAMENTOS',
    steps: [
      { target: '[data-tour="canc-acoes"]', title: 'Ações Rápidas', icon: 'bolt', description: 'Acesse o histórico de cancelamentos ou limpe todos os dados da calculadora.' },
      { target: '[data-tour="canc-procedimentos"]', title: 'Procedimentos', icon: 'medical_services', description: 'Adicione os procedimentos do pacote: nome, sessões contratadas, realizadas e valor unitário.' },
      { target: '[data-tour="canc-cenarios"]', title: 'Cenários de Cálculo', icon: 'calculate', description: 'Alterne entre "Sem Multa" e "Com Multa" para simular diferentes cenários de cancelamento.' },
      { target: '[data-tour="canc-resultado"]', title: 'Resultado', icon: 'receipt_long', description: 'Veja o valor a restituir calculado automaticamente. Salve ou gere um PDF do cálculo.' },
    ],
  },

  /* ── USUÁRIOS ── */
  {
    pageKey: 'usuarios',
    label: 'USUÁRIOS',
    steps: [
      { target: '[data-tour="usr-novo"]', title: 'Novo Usuário', icon: 'person_add', description: 'Cadastre um novo usuário no sistema definindo nome, email, cargo e permissões de acesso.' },
      { target: '[data-tour="usr-kpis"]', title: 'Indicadores', icon: 'monitoring', description: 'Veja o total de usuários, administradores, gerentes e atendentes cadastrados no sistema.' },
      { target: '[data-tour="usr-tabela"]', title: 'Tabela de Usuários', icon: 'table_view', description: 'Gerencie todos os usuários. Edite permissões, redefina senhas ou desative contas.' },
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
   HELPER — detect dark mode
   ═══════════════════════════════════════════════════════════════════ */
function useIsDark() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const check = () => setDark(document.documentElement.getAttribute('data-theme') === 'dark');
    check();
    const obs = new MutationObserver(check);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  }, []);
  return dark;
}

/* ═══════════════════════════════════════════════════════════════════
   GLOBAL STYLES — injected once
   ═══════════════════════════════════════════════════════════════════ */
const TOUR_STYLES = `
  @keyframes tourSlideIn {
    from { opacity: 0; transform: translateY(10px) scale(0.97); }
    to   { opacity: 1; transform: translateY(0) scale(1); }
  }
  @keyframes tourDotPulse {
    0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(230,0,126,0.4); }
    50% { transform: scale(1.3); box-shadow: 0 0 0 8px rgba(230,0,126,0); }
  }
  @keyframes tourProgressBar {
    from { width: 0%; }
    to   { width: var(--tour-progress); }
  }
`;

/* ═══════════════════════════════════════════════════════════════════
   SPOTLIGHT OVERLAY
   ═══════════════════════════════════════════════════════════════════ */
function SpotlightOverlay({ rect, onClick }: { rect: DOMRect | null; onClick: () => void }) {
  if (!rect) return null;

  const pad = 10;
  const r = 16;
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
        <rect width="100%" height="100%" fill="rgba(0,0,0,0.6)" mask="url(#tour-mask)" />
      </svg>
      {/* Glow ring around spotlight */}
      <div style={{
        position: 'absolute',
        left: x, top: y, width: w, height: h,
        borderRadius: r,
        boxShadow: '0 0 0 3px var(--primary), 0 0 24px rgba(230,0,126,0.25)',
        pointerEvents: 'none',
        transition: 'all 0.4s cubic-bezier(0.4,0,0.2,1)',
      }} />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   TOOLTIP — theme-aware card matching screenshot design
   ═══════════════════════════════════════════════════════════════════ */
function TourTooltip({
  step, stepIndex, totalSteps, rect, tourLabel,
  onNext, onSkip, onDismissForever, isDark,
}: {
  step: TourStep;
  stepIndex: number;
  totalSteps: number;
  rect: DOMRect | null;
  tourLabel: string;
  onNext: () => void;
  onSkip: () => void;
  onDismissForever: () => void;
  isDark: boolean;
}) {
  const [pos, setPos] = useState<{ top: number; left: number; placement: 'below' | 'above' }>({ top: 0, left: 0, placement: 'below' });

  useEffect(() => {
    if (!rect) return;
    const pad = 10;
    const tooltipW = 380;
    const tooltipH = 260;
    const gap = 20;

    const spaceBelow = window.innerHeight - (rect.bottom + pad);
    const placement = spaceBelow > tooltipH + gap + 30 ? 'below' : 'above';

    let top: number;
    if (placement === 'below') {
      top = rect.bottom + pad + gap;
    } else {
      top = rect.top - pad - gap - tooltipH;
    }

    let left = rect.left + rect.width / 2 - tooltipW / 2;
    left = Math.max(16, Math.min(left, window.innerWidth - tooltipW - 16));
    top = Math.max(16, top);

    setPos({ top, left, placement });
  }, [rect]);

  if (!rect) return null;

  const isLast = stepIndex === totalSteps - 1;
  const pad = 10;
  const progress = ((stepIndex + 1) / totalSteps) * 100;

  // Connector dot
  const dotX = rect.left + rect.width / 2;
  const dotY = pos.placement === 'below' ? rect.bottom + pad + 5 : rect.top - pad - 5;

  // Theme-aware colors
  const cardBg = isDark ? 'hsl(220, 22%, 14%)' : '#ffffff';
  const headerBg = isDark ? 'hsl(220, 22%, 18%)' : 'hsl(327, 30%, 97%)';
  const titleColor = isDark ? 'hsl(210, 20%, 92%)' : 'hsl(215, 28%, 17%)';
  const descColor = isDark ? 'hsl(210, 14%, 60%)' : 'hsl(215, 16%, 42%)';
  const labelColor = isDark ? 'hsl(327, 80%, 65%)' : 'var(--primary)';
  const borderColor = isDark ? 'hsl(220, 14%, 24%)' : 'hsl(210, 20%, 92%)';
  const dotBg = isDark ? 'hsl(327, 80%, 55%)' : 'var(--primary)';
  const dotInactive = isDark ? 'hsl(220, 14%, 28%)' : 'hsl(210, 20%, 88%)';
  const skipBorder = isDark ? 'hsl(220, 14%, 30%)' : 'var(--border)';
  const skipColor = isDark ? 'hsl(210, 14%, 70%)' : 'var(--text-muted)';
  const dismissColor = isDark ? 'hsl(210, 14%, 45%)' : 'var(--text-muted)';
  const iconBg = isDark ? 'hsl(327, 40%, 18%)' : 'hsl(327, 60%, 95%)';
  const iconColor = isDark ? 'hsl(327, 80%, 65%)' : 'var(--primary)';

  return (
    <>
      {/* Connector dot */}
      <div style={{
        position: 'fixed',
        left: dotX - 7, top: dotY - 7,
        width: 14, height: 14,
        borderRadius: '50%',
        background: dotBg,
        border: `2px solid ${cardBg}`,
        zIndex: 100001,
        animation: 'tourDotPulse 2s ease-in-out infinite',
        transition: 'all 0.4s cubic-bezier(0.4,0,0.2,1)',
      }} />

      {/* Tooltip card */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'fixed',
          top: pos.top, left: pos.left,
          width: 380, maxWidth: 'calc(100vw - 32px)',
          background: cardBg,
          borderRadius: 20,
          border: `1px solid ${borderColor}`,
          boxShadow: isDark
            ? '0 20px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.03)'
            : '0 20px 60px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.04)',
          zIndex: 100001,
          overflow: 'hidden',
          animation: 'tourSlideIn 0.35s cubic-bezier(0.34,1.56,0.64,1)',
          transition: 'top 0.4s cubic-bezier(0.4,0,0.2,1), left 0.4s cubic-bezier(0.4,0,0.2,1)',
        }}
      >
        {/* ── Header bar ── */}
        <div style={{
          background: headerBg,
          padding: '14px 20px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          borderBottom: `1px solid ${borderColor}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 10,
              background: 'linear-gradient(135deg, var(--primary), #ff4db1)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#fff' }}>school</span>
            </div>
            <div>
              <div style={{ fontSize: '0.68rem', fontWeight: 800, color: labelColor, letterSpacing: '0.5px', textTransform: 'uppercase' as const }}>
                TOUR • {tourLabel}
              </div>
              <div style={{ fontSize: '0.72rem', fontWeight: 600, color: descColor }}>
                Etapa {stepIndex + 1} de {totalSteps}
              </div>
            </div>
          </div>
          {/* Close X */}
          <button
            onClick={onSkip}
            style={{
              width: 28, height: 28, borderRadius: 8,
              border: 'none', background: 'transparent',
              color: descColor, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span>
          </button>
        </div>

        {/* ── Progress bar ── */}
        <div style={{ height: 3, background: isDark ? 'hsl(220, 14%, 20%)' : 'hsl(210, 20%, 92%)' }}>
          <div style={{
            height: '100%',
            width: `${progress}%`,
            background: 'linear-gradient(90deg, var(--primary), #ff4db1)',
            borderRadius: 3,
            transition: 'width 0.4s ease',
          }} />
        </div>

        {/* ── Body ── */}
        <div style={{ padding: '20px 22px 16px' }}>
          {/* Title with icon */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
            {step.icon && (
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: iconBg,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                <span className="material-symbols-outlined" style={{ fontSize: 20, color: iconColor }}>{step.icon}</span>
              </div>
            )}
            <div style={{ fontWeight: 800, fontSize: '1rem', color: titleColor, lineHeight: 1.3 }}>
              {step.title}
            </div>
          </div>

          {/* Description */}
          <div style={{
            fontSize: '0.86rem', color: descColor, lineHeight: 1.65,
            marginBottom: 20, fontWeight: 500,
            marginLeft: step.icon ? 48 : 0,
          }}>
            {step.description}
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <button
              onClick={onSkip}
              style={{
                padding: '9px 20px', borderRadius: 12,
                border: `1.5px solid ${skipBorder}`,
                background: 'transparent',
                color: skipColor, fontWeight: 700, fontSize: '0.82rem',
                cursor: 'pointer', fontFamily: 'inherit',
                transition: 'all 0.2s',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.borderColor = 'var(--primary)';
                (e.currentTarget as HTMLElement).style.color = 'var(--primary)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.borderColor = skipBorder;
                (e.currentTarget as HTMLElement).style.color = skipColor;
              }}
            >
              Pular tour
            </button>

            <button
              onClick={onNext}
              style={{
                padding: '9px 24px', borderRadius: 12,
                border: 'none',
                background: 'linear-gradient(135deg, var(--primary), #ff4db1)',
                color: '#fff', fontWeight: 700, fontSize: '0.82rem',
                cursor: 'pointer', fontFamily: 'inherit',
                boxShadow: '0 4px 16px rgba(230,0,126,0.3)',
                display: 'flex', alignItems: 'center', gap: 6,
                transition: 'all 0.2s',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 6px 20px rgba(230,0,126,0.4)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = ''; (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 16px rgba(230,0,126,0.3)'; }}
            >
              {isLast ? 'OK' : `Próximo`}
              {!isLast && <span className="material-symbols-outlined" style={{ fontSize: 16 }}>arrow_forward</span>}
            </button>
          </div>

          {/* Bottom: "Não mostrar mais" + dots */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, paddingTop: 12, borderTop: `1px solid ${borderColor}` }}>
            <button
              onClick={onDismissForever}
              style={{
                background: 'none', border: 'none',
                color: dismissColor, fontSize: '0.74rem', fontWeight: 600,
                cursor: 'pointer', fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', gap: 4,
                transition: 'color 0.15s',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--primary)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = dismissColor; }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>visibility_off</span>
              Não mostrar mais
            </button>

            {/* Progress dots */}
            <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
              {Array.from({ length: totalSteps }).map((_, i) => (
                <div key={i} style={{
                  width: i === stepIndex ? 18 : 6,
                  height: 6,
                  borderRadius: 3,
                  background: i === stepIndex ? 'var(--primary)' : dotInactive,
                  transition: 'all 0.3s ease',
                }} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   TOUR ENGINE
   ═══════════════════════════════════════════════════════════════════ */
function TourEngine({
  steps, tourLabel, onComplete, onSkip, onDismissForever,
}: {
  steps: TourStep[];
  tourLabel: string;
  onComplete: () => void;
  onSkip: () => void;
  onDismissForever: () => void;
}) {
  const [stepIndex, setStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const isDark = useIsDark();

  const currentStep = steps[stepIndex];

  // Find and measure target
  useEffect(() => {
    if (!currentStep) return;

    const findTarget = () => {
      const el = document.querySelector(currentStep.target) as HTMLElement | null;
      if (el) {
        const rect = el.getBoundingClientRect();
        setTargetRect(rect);
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.style.position = 'relative';
        el.style.zIndex = '99999';
        el.style.transition = 'all 0.3s ease';
        return el;
      }
      return null;
    };

    const timer = setTimeout(() => {
      const el = findTarget();
      if (!el) setTimeout(findTarget, 500);
    }, 150);

    return () => {
      clearTimeout(timer);
      const el = document.querySelector(currentStep.target) as HTMLElement | null;
      if (el) { el.style.zIndex = ''; el.style.position = ''; }
    };
  }, [stepIndex, currentStep]);

  // Track resize/scroll
  useEffect(() => {
    if (!currentStep) return;
    const updateRect = () => {
      const el = document.querySelector(currentStep.target) as HTMLElement | null;
      if (el) setTargetRect(el.getBoundingClientRect());
    };
    window.addEventListener('resize', updateRect);
    window.addEventListener('scroll', updateRect, true);
    return () => {
      window.removeEventListener('resize', updateRect);
      window.removeEventListener('scroll', updateRect, true);
    };
  }, [currentStep]);

  const handleNext = () => {
    const el = document.querySelector(currentStep.target) as HTMLElement | null;
    if (el) { el.style.zIndex = ''; el.style.position = ''; }
    if (stepIndex < steps.length - 1) {
      setStepIndex(stepIndex + 1);
    } else {
      onComplete();
    }
  };

  if (!currentStep) return null;

  return createPortal(
    <>
      <style>{TOUR_STYLES}</style>
      <SpotlightOverlay rect={targetRect} onClick={onSkip} />
      <TourTooltip
        step={currentStep}
        stepIndex={stepIndex}
        totalSteps={steps.length}
        rect={targetRect}
        tourLabel={tourLabel}
        onNext={handleNext}
        onSkip={onSkip}
        onDismissForever={onDismissForever}
        isDark={isDark}
      />
    </>,
    document.body
  );
}

/* ═══════════════════════════════════════════════════════════════════
   PROVIDER
   ═══════════════════════════════════════════════════════════════════ */
export function TourProvider({ children }: { children: React.ReactNode }) {
  const [activeSteps, setActiveSteps] = useState<TourStep[] | null>(null);
  const [activeLabel, setActiveLabel] = useState('');
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<Record<string, boolean>>({});

  useEffect(() => { setDismissed(getDismissed()); }, []);

  const startTour = useCallback((pageKey: string) => {
    if (dismissed[pageKey]) return;
    const tour = TOUR_DATA.find(t => t.pageKey === pageKey);
    if (!tour || tour.steps.length === 0) return;
    setTimeout(() => {
      setActiveKey(pageKey);
      setActiveLabel(tour.label);
      setActiveSteps(tour.steps);
    }, 800);
  }, [dismissed]);

  const resetTour = useCallback((pageKey?: string) => {
    if (pageKey) {
      const next = { ...dismissed };
      delete next[pageKey];
      setDismissed(next);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      const tour = TOUR_DATA.find(t => t.pageKey === pageKey);
      if (tour) {
        setTimeout(() => {
          setActiveKey(pageKey);
          setActiveLabel(tour.label);
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

  const handleDismissForever = useCallback(() => {
    // Mark ALL tours as done
    const allDismissed: Record<string, boolean> = {};
    TOUR_DATA.forEach(t => { allDismissed[t.pageKey] = true; });
    setDismissed(allDismissed);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(allDismissed));
    setActiveSteps(null);
    setActiveKey(null);
  }, []);

  return (
    <TourContext.Provider value={{ startTour, resetTour }}>
      {children}
      {activeSteps && (
        <TourEngine
          steps={activeSteps}
          tourLabel={activeLabel}
          onComplete={handleComplete}
          onSkip={handleSkip}
          onDismissForever={handleDismissForever}
        />
      )}
    </TourContext.Provider>
  );
}
