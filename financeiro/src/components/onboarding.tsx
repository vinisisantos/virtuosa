'use client';
import { useState, useEffect, createContext, useContext, useCallback, useRef } from 'react';

/* ═══════════════════════════════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════════════════════════════ */
interface TourStep {
  target?: string;       // data-tour value → finds [data-tour="<value>"]
  icon: string;
  title: string;
  description: string;
  placement?: 'top' | 'bottom' | 'left' | 'right';
  permission?: string;
  roles?: string[];
}

interface PageTour {
  pageKey: string;
  pageTitle: string;
  pageIcon: string;
  color: string;
  steps: TourStep[];
  roles?: string[];
}

/* ═══════════════════════════════════════════════════════════════════
   TOUR DATA — one tour per page
   ═══════════════════════════════════════════════════════════════════ */
const TOUR_DATA: PageTour[] = [
  {
    pageKey: 'agenda', pageTitle: 'Agenda', pageIcon: 'calendar_month', color: '#e600a0',
    steps: [
      { target: 'nav-agenda', icon: 'calendar_month', title: 'Módulo Agenda', description: 'Aqui você gerencia todos os agendamentos da clínica. Alterne entre as visualizações de Dia, Semana, Mês e Lista.' },
      { icon: 'calendar_today', title: 'Visualizações', description: 'Use os botões no topo da agenda para alternar entre as visualizações. Clique num dia no mini-calendário lateral para navegar rapidamente.' },
      { icon: 'add_circle', title: 'Novo Agendamento', description: 'Clique em qualquer horário vazio na grade para abrir o formulário. Preencha cliente, procedimento, profissional e horário.' },
      { icon: 'drag_indicator', title: 'Arrastar e Soltar', description: 'Segure e arraste um agendamento para remarcar para outro horário. O sistema salva a alteração automaticamente.' },
      { icon: 'notifications_active', title: 'Lembretes WhatsApp', description: 'Na sidebar à esquerda, veja agendamentos das próximas 24h e envie lembretes por WhatsApp com um clique.' },
      { icon: 'check_circle', title: 'Dar Baixa', description: 'Ao finalizar um procedimento, clique em "Dar Baixa" para marcar como concluído. Agendamentos expirados são finalizados automaticamente.', permission: 'darBaixa' },
      { target: 'unit-selector', icon: 'location_on', title: 'Filtre por Unidade', description: 'Use este seletor para alternar entre unidades. Todos os dados da agenda serão atualizados automaticamente.' },
    ],
  },
  {
    pageKey: 'dashboard', pageTitle: 'Dashboard', pageIcon: 'dashboard', color: '#6366f1',
    steps: [
      { target: 'nav-dashboard', icon: 'dashboard', title: 'Dashboard', description: 'O Dashboard é o centro de comando do seu negócio. Aqui você acompanha KPIs, métricas e análises em tempo real.' },
      { icon: 'monitoring', title: 'KPIs e Métricas', description: 'Na visão geral, veja faturamento, cancelamentos, ticket médio e tendências. Use o seletor de mês para navegar entre períodos.' },
      { icon: 'pie_chart', title: 'Gráficos Interativos', description: 'Os gráficos de pizza e barras mostram distribuição por vendedor, procedimento e pagamento. Passe o mouse para ver detalhes.' },
      { target: 'unit-selector', icon: 'location_on', title: 'Filtre por Unidade', description: 'Alterne entre as unidades para filtrar todas as métricas automaticamente. Ideal para comparar o desempenho de cada filial.' },
      { target: 'search-button', icon: 'search', title: 'Busca Rápida', description: 'Use Ctrl+K (ou ⌘+K no Mac) para buscar qualquer funcionalidade do sistema instantaneamente.' },
      { target: 'notification-bell', icon: 'notifications', title: 'Central de Notificações', description: 'Fique por dentro de tudo: aprovações de reembolso, novos agendamentos, metas atingidas e alertas são exibidos aqui.' },
    ],
  },
  {
    pageKey: 'financeiro', pageTitle: 'Financeiro', pageIcon: 'payments', color: '#6366f1',
    steps: [
      { target: 'nav-financeiro', icon: 'payments', title: 'Módulo Financeiro', description: 'O módulo financeiro unifica toda a gestão de folha, custos, adiantamentos, premiações e reembolsos em um só lugar.' },
      { icon: 'payments', title: 'Folha de Pagamento', description: 'Importe a folha via PDF ou adicione colaboradores manualmente. O sistema calcula INSS, IRRF, VT, FGTS e provisões automaticamente.' },
      { icon: 'receipt_long', title: 'Holerite', description: 'Veja o demonstrativo líquido de cada colaborador com todos os descontos legais, premiação e adiantamento.' },
      { icon: 'commute', title: 'VT e VR', description: 'Controle vale-transporte e vale-refeição individualmente com histórico mensal. Use "Gerar Automático" para preencher todos de uma vez.' },
      { icon: 'account_balance_wallet', title: 'Adiantamento', description: 'Registre adiantamentos salariais. Os valores são descontados automaticamente na folha do mês correspondente.' },
      { icon: 'receipt_long', title: 'Reembolso', description: 'Funcionários enviam solicitações com comprovante e o admin aprova/reprova. Ao dar baixa, anexe o comprovante de pagamento.' },
      { icon: 'account_balance', title: 'Custos', description: 'A aba Custos unifica Custos Fixos, Contas a Pagar e Custos Futuros. Tudo filtrado pela unidade selecionada no header.' },
      { icon: 'analytics', title: 'Análise', description: 'Veja margem de lucro, ponto de equilíbrio e projeções baseados nos seus dados reais de receita e despesas.' },
    ],
    roles: ['ADMINISTRADOR', 'GERENTE'],
  },
  {
    pageKey: 'clientes', pageTitle: 'CRM & Clientes', pageIcon: 'groups', color: '#10b981',
    steps: [
      { target: 'nav-crm', icon: 'groups', title: 'CRM & Clientes', description: 'O CRM centraliza a gestão de leads, comunicações, fidelidade e retenção dos seus clientes.' },
      { icon: 'view_kanban', title: 'Kanban de Leads', description: 'Arraste os cards entre as colunas para atualizar o status do lead. Clique num card para ver detalhes e adicionar anotações.' },
      { icon: 'person_add', title: 'Novo Lead', description: 'Clique em "+ Novo Lead" para adicionar um cliente potencial. Preencha nome, telefone e origem, e o lead entra no funil automaticamente.' },
      { icon: 'bar_chart', title: 'Estatísticas', description: 'Veja taxa de conversão, tempo médio de fechamento e origem dos leads. Use para otimizar suas estratégias de captação.' },
      { icon: 'chat', title: 'WhatsApp & Comunicações', description: 'Envie mensagens em massa, acompanhe histórico de comunicações e gerencie campanhas diretamente do CRM.' },
    ],
  },
  {
    pageKey: 'cancelamentos', pageTitle: 'Cancelamentos', pageIcon: 'cancel', color: '#ef4444',
    steps: [
      { icon: 'upload_file', title: 'Importar Dados', description: 'Importe seus dados de cancelamento via CSV ou Excel. O sistema identifica automaticamente as colunas e formata os valores.' },
      { icon: 'filter_alt', title: 'Filtros Avançados', description: 'Filtre por período, motivo, procedimento ou vendedor para analisar os padrões de cancelamento da sua clínica.' },
      { icon: 'insights', title: 'Análise de Tendências', description: 'Os gráficos mostram a evolução dos cancelamentos ao longo do tempo, permitindo identificar períodos críticos e agir preventivamente.' },
    ],
  },
  {
    pageKey: 'pacotes', pageTitle: 'Vendas & Pacotes', pageIcon: 'inventory_2', color: '#8b5cf6',
    steps: [
      { target: 'nav-vendas', icon: 'inventory_2', title: 'Módulo de Vendas', description: 'Gerencie pacotes, orçamentos, vendas e acompanhe o progresso dos pacientes em seus tratamentos.' },
      { icon: 'add_box', title: 'Criar Pacote', description: 'Defina pacotes com procedimentos, número de sessões e valor. Os pacotes ficam disponíveis para venda na ficha do paciente.' },
      { icon: 'person', title: 'Pacientes', description: 'Em "Pacientes", veja todos os cadastrados. Clique num nome para abrir a ficha completa com histórico de sessões e contrato.' },
      { icon: 'event_note', title: 'Controle de Sessões', description: 'Na ficha do paciente, controle as sessões realizadas. O sistema mostra progresso e alerta quando o pacote está acabando.' },
      { icon: 'request_quote', title: 'Orçamento', description: 'Gere propostas de pacotes personalizadas com descontos e condições especiais de pagamento.' },
    ],
  },
  {
    pageKey: 'catalogo', pageTitle: 'Catálogo', pageIcon: 'menu_book', color: '#0ea5e9',
    steps: [
      { icon: 'spa', title: 'Serviços & Procedimentos', description: 'Cadastre todos os procedimentos da clínica com nome, duração, preço e categoria. Esses serviços aparecem na agenda e nos pacotes.' },
      { icon: 'category', title: 'Categorias', description: 'Organize serviços em categorias (ex: Depilação, Facial, Corporal) para facilitar a busca e organização na agenda.' },
    ],
  },
  {
    pageKey: 'contratos', pageTitle: 'Contratos', pageIcon: 'gavel', color: '#f59e0b',
    steps: [
      { icon: 'description', title: 'Gerar Contrato', description: 'Clique em "Gerar Contrato" na ficha do paciente. O sistema preenche automaticamente os dados do template com as informações do cliente.' },
      { icon: 'draw', title: 'Assinatura Digital', description: 'O paciente pode assinar digitalmente pelo celular. Após assinado, o contrato fica salvo e disponível para download em PDF.' },
    ],
  },
  {
    pageKey: 'estoque', pageTitle: 'Estoque', pageIcon: 'inventory', color: '#10b981',
    steps: [
      { icon: 'add_shopping_cart', title: 'Entrada de Produtos', description: 'Registre a entrada de novos produtos com nome, quantidade, valor unitário e fornecedor. O estoque é atualizado automaticamente.' },
      { icon: 'remove_shopping_cart', title: 'Saída de Produtos', description: 'Registre saídas conforme os produtos são utilizados. O sistema alerta quando o estoque atinge o nível mínimo.' },
    ],
  },
  {
    pageKey: 'pagamentos', pageTitle: 'Lançamentos', pageIcon: 'point_of_sale', color: '#e600a0',
    steps: [
      { icon: 'add_card', title: 'Novo Lançamento', description: 'Registre vendas com cliente, procedimento, vendedor, valor, forma de pagamento e unidade. Tudo sincroniza com o Dashboard.' },
      { icon: 'receipt', title: 'Histórico', description: 'Veja todos os lançamentos com filtros por período, vendedor e unidade. Exporte para CSV quando necessário.' },
    ],
  },
  {
    pageKey: 'usuarios', pageTitle: 'Gestão de Usuários', pageIcon: 'admin_panel_settings', color: '#ef4444',
    steps: [
      { icon: 'person_add', title: 'Criar Usuário', description: 'Adicione novos usuários com nome, email, senha, cargo e unidade. Defina as permissões de acesso individualmente.' },
      { icon: 'lock', title: 'Permissões Granulares', description: 'Cada permissão controla o acesso a uma seção do sistema. Administradores têm acesso total. Configure com cuidado para garantir segurança.' },
    ],
    roles: ['ADMINISTRADOR'],
  },
  {
    pageKey: 'pedidos', pageTitle: 'Pedidos', pageIcon: 'shopping_bag', color: '#f97316',
    steps: [
      { icon: 'shopping_bag', title: 'Gestão de Pedidos', description: 'Crie e acompanhe pedidos de fornecedores. Controle status, valores e datas de entrega em um só lugar.' },
      { icon: 'link', title: 'Importar de Links', description: 'Cole o link do produto (Mercado Livre, etc.) e o sistema extrai nome e preço automaticamente para agilizar o cadastro.' },
      { icon: 'local_shipping', title: 'Acompanhamento', description: 'Visualize o status de cada pedido (pendente, comprado, entregue) e receba alertas sobre entregas atrasadas.' },
    ],
  },
];

/* ═══════════════════════════════════════════════════════════════════
   STORAGE
   ═══════════════════════════════════════════════════════════════════ */
const STORAGE_KEY = 'virtuosa_tour_dismissed';

function getDismissed(): Record<string, boolean> {
  if (typeof window === 'undefined') return {};
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; }
}

/* ═══════════════════════════════════════════════════════════════════
   CONTEXT
   ═══════════════════════════════════════════════════════════════════ */
interface OnboardingContextType {
  triggerOnboarding: (pageKey: string) => void;
  resetTour: (pageKey?: string) => void;
}

const OnboardingContext = createContext<OnboardingContextType>({
  triggerOnboarding: () => {},
  resetTour: () => {},
});
export const useOnboarding = () => useContext(OnboardingContext);

/* ═══════════════════════════════════════════════════════════════════
   PROVIDER
   ═══════════════════════════════════════════════════════════════════ */
export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const [activePageKey, setActivePageKey] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [dismissed, setDismissed] = useState<Record<string, boolean>>({});
  const [userRole, setUserRole] = useState('');
  const [userPerms, setUserPerms] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setDismissed(getDismissed());
    try {
      const raw = localStorage.getItem('virtuosa_user');
      if (raw) {
        const u = JSON.parse(raw);
        setUserRole(u.role || '');
        setUserPerms(u.permissions || {});
      }
    } catch {}
  }, []);

  const triggerOnboarding = useCallback((pageKey: string) => {
    if (dismissed[pageKey]) return;
    const tour = TOUR_DATA.find(t => t.pageKey === pageKey);
    if (!tour) return;
    if (tour.roles?.length) {
      const isAdmin = userPerms.admin === true || userRole === 'ADMINISTRADOR';
      if (!isAdmin && !tour.roles.includes(userRole)) return;
    }
    setActivePageKey(pageKey);
    setCurrentStep(0);
  }, [dismissed, userRole, userPerms]);

  const resetTour = useCallback((pageKey?: string) => {
    if (pageKey) {
      const updated = { ...dismissed };
      delete updated[pageKey];
      setDismissed(updated);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      // Auto-trigger after reset
      setTimeout(() => triggerOnboarding(pageKey), 200);
    } else {
      setDismissed({});
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [dismissed, triggerOnboarding]);

  const handleDismiss = () => {
    if (activePageKey) {
      const updated = { ...dismissed, [activePageKey]: true };
      setDismissed(updated);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    }
    setActivePageKey(null);
    setCurrentStep(0);
  };

  const handleClose = () => {
    setActivePageKey(null);
    setCurrentStep(0);
  };

  const tour = activePageKey ? TOUR_DATA.find(t => t.pageKey === activePageKey) : null;

  const visibleSteps = tour ? tour.steps.filter(step => {
    if (step.permission) {
      const isAdmin = userPerms.admin === true || userRole === 'ADMINISTRADOR';
      if (!isAdmin && !userPerms[step.permission]) return false;
    }
    if (step.roles?.length) {
      const isAdmin = userPerms.admin === true || userRole === 'ADMINISTRADOR';
      if (!isAdmin && !step.roles.includes(userRole)) return false;
    }
    return true;
  }) : [];

  return (
    <OnboardingContext.Provider value={{ triggerOnboarding, resetTour }}>
      {children}
      {tour && visibleSteps.length > 0 && (
        <GuidedTour
          tour={tour}
          steps={visibleSteps}
          currentStep={currentStep}
          onStepChange={setCurrentStep}
          onClose={handleClose}
          onDismiss={handleDismiss}
        />
      )}
    </OnboardingContext.Provider>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   GUIDED TOUR COMPONENT — Spotlight + Tooltip
   ═══════════════════════════════════════════════════════════════════ */
function GuidedTour({ tour, steps, currentStep, onStepChange, onClose, onDismiss }: {
  tour: PageTour;
  steps: TourStep[];
  currentStep: number;
  onStepChange: (step: number) => void;
  onClose: () => void;
  onDismiss: () => void;
}) {
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [tooltipStyle, setTooltipStyle] = useState<React.CSSProperties>({});
  const [arrowStyle, setArrowStyle] = useState<React.CSSProperties>({});
  const [arrowDir, setArrowDir] = useState<'top' | 'bottom' | 'left' | 'right'>('top');
  const [ready, setReady] = useState(false);
  const [fadeKey, setFadeKey] = useState(0);

  const step = steps[currentStep];
  const isLast = currentStep >= steps.length - 1;
  const isFirst = currentStep === 0;

  /* ── Find & focus target element ── */
  useEffect(() => {
    setReady(false);
    setFadeKey(k => k + 1);

    const findTarget = () => {
      if (!step.target) {
        setTargetRect(null);
        setReady(true);
        return;
      }

      const el = document.querySelector(`[data-tour="${step.target}"]`) as HTMLElement;
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        // Wait for scroll to settle
        setTimeout(() => {
          const rect = el.getBoundingClientRect();
          setTargetRect(rect);
          setReady(true);
        }, 350);
      } else {
        setTargetRect(null);
        setReady(true);
      }
    };

    const timer = setTimeout(findTarget, 80);
    return () => clearTimeout(timer);
  }, [step, currentStep]);

  /* ── Position tooltip relative to target ── */
  useEffect(() => {
    if (!ready) return;

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const isMobile = vw < 640;
    const tooltipW = isMobile ? vw - 32 : Math.min(400, vw - 32);
    const tooltipH = tooltipRef.current?.offsetHeight || 280;

    if (!targetRect) {
      // Centered modal fallback
      setTooltipStyle({
        position: 'fixed',
        top: Math.max(16, (vh - tooltipH) / 2),
        left: Math.max(16, (vw - tooltipW) / 2),
        width: tooltipW,
      });
      setArrowDir('top');
      setArrowStyle({ display: 'none' });
      return;
    }

    const pad = 10;
    const gap = 14;
    const spaceBelow = vh - targetRect.bottom - pad;
    const spaceAbove = targetRect.top - pad;

    let top = 0;
    let left = 0;
    let aDir: 'top' | 'bottom' = 'top';

    const preferred = step.placement;

    // On mobile, always place below or above
    if (preferred === 'top' || (!preferred && spaceAbove > spaceBelow && spaceAbove >= tooltipH + gap)) {
      top = targetRect.top - pad - gap - tooltipH;
      aDir = 'bottom';
    } else {
      top = targetRect.bottom + pad + gap;
      aDir = 'top';
    }

    // Center horizontally relative to target
    left = targetRect.left + targetRect.width / 2 - tooltipW / 2;

    // Bounds check
    top = Math.max(12, Math.min(vh - tooltipH - 12, top));
    left = Math.max(12, Math.min(vw - tooltipW - 12, left));

    setTooltipStyle({
      position: 'fixed' as const,
      top, left,
      width: tooltipW,
    });
    setArrowDir(aDir);

    // Arrow position (pointing to the center of the target)
    const arrowLeft = Math.max(20, Math.min(tooltipW - 20, targetRect.left + targetRect.width / 2 - left));
    if (aDir === 'top') {
      setArrowStyle({
        position: 'absolute' as const, top: -7, left: arrowLeft, transform: 'translateX(-50%)',
        width: 0, height: 0,
        borderLeft: '8px solid transparent', borderRight: '8px solid transparent',
        borderBottom: '8px solid var(--card-bg, #fff)',
      });
    } else {
      setArrowStyle({
        position: 'absolute' as const, bottom: -7, left: arrowLeft, transform: 'translateX(-50%)',
        width: 0, height: 0,
        borderLeft: '8px solid transparent', borderRight: '8px solid transparent',
        borderTop: '8px solid var(--card-bg, #fff)',
      });
    }
  }, [targetRect, ready, step.placement]);

  /* ── Keyboard navigation ── */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' && !isLast) onStepChange(currentStep + 1);
      if (e.key === 'ArrowLeft' && !isFirst) onStepChange(currentStep - 1);
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [currentStep, isFirst, isLast, onClose, onStepChange]);

  /* ── Update rect on resize/scroll ── */
  useEffect(() => {
    if (!step.target) return;
    const update = () => {
      const el = document.querySelector(`[data-tour="${step.target}"]`);
      if (el) setTargetRect(el.getBoundingClientRect());
    };
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [step.target]);

  const spotPad = 8;

  return (
    <>
      <style>{`
        @keyframes tourFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes tourSlide { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes tourPulse {
          0%, 100% { box-shadow: 0 0 0 9999px rgba(0,0,0,0.55), 0 0 0 3px ${tour.color}50, 0 0 20px ${tour.color}20; }
          50% { box-shadow: 0 0 0 9999px rgba(0,0,0,0.55), 0 0 0 6px ${tour.color}30, 0 0 30px ${tour.color}15; }
        }
        @keyframes tourContentSlide { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>

      {/* ── Overlay (click to close) ── */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 99997,
          background: targetRect ? 'transparent' : 'rgba(0,0,0,0.55)',
          backdropFilter: targetRect ? 'none' : 'blur(4px)',
          animation: 'tourFadeIn 0.3s ease',
        }}
      />

      {/* ── Spotlight around target ── */}
      {targetRect && ready && (
        <div style={{
          position: 'fixed',
          top: targetRect.top - spotPad,
          left: targetRect.left - spotPad,
          width: targetRect.width + spotPad * 2,
          height: targetRect.height + spotPad * 2,
          borderRadius: 12,
          zIndex: 99998,
          pointerEvents: 'none',
          transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
          animation: 'tourPulse 2.5s ease-in-out infinite',
        }} />
      )}

      {/* ── Tooltip ── */}
      <div
        ref={tooltipRef}
        onClick={e => e.stopPropagation()}
        key={fadeKey}
        style={{
          ...tooltipStyle,
          zIndex: 99999,
          background: 'var(--card-bg, #fff)',
          border: '1px solid var(--border, #e5e7eb)',
          borderRadius: 18,
          boxShadow: `0 20px 60px rgba(0,0,0,0.22), 0 0 0 1px ${tour.color}10`,
          animation: 'tourSlide 0.35s ease',
          overflow: 'hidden',
        }}
      >
        {/* Arrow */}
        {targetRect && <div style={arrowStyle} />}

        {/* Header */}
        <div style={{
          padding: '16px 18px 12px',
          background: `linear-gradient(135deg, ${tour.color}10, ${tour.color}05)`,
          borderBottom: `1px solid ${tour.color}12`,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                width: 34, height: 34, borderRadius: 10,
                background: `linear-gradient(135deg, ${tour.color}, ${tour.color}cc)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: `0 3px 10px ${tour.color}30`,
              }}>
                <span className="material-symbols-outlined" style={{ fontSize: 17, color: '#fff' }}>{tour.pageIcon}</span>
              </div>
              <div>
                <div style={{ fontSize: '0.62rem', fontWeight: 700, color: tour.color, textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                  Tour • {tour.pageTitle}
                </div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                  Etapa {currentStep + 1} de {steps.length}
                </div>
              </div>
            </div>
            <button onClick={onClose} style={{
              width: 28, height: 28, borderRadius: 8, border: 'none',
              background: 'rgba(0,0,0,0.06)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--text-muted)' }}>close</span>
            </button>
          </div>

          {/* Progress bar */}
          <div style={{ height: 3, borderRadius: 2, background: `${tour.color}12`, overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 2,
              background: `linear-gradient(90deg, ${tour.color}, ${tour.color}bb)`,
              width: `${((currentStep + 1) / steps.length) * 100}%`,
              transition: 'width 0.4s ease',
            }} />
          </div>
        </div>

        {/* Content */}
        <div style={{ padding: '16px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, animation: 'tourContentSlide 0.3s ease' }}>
            <div style={{
              width: 42, height: 42, borderRadius: 12,
              background: `${tour.color}10`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 22, color: tour.color }}>{step.icon}</span>
            </div>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: 'var(--text-main)' }}>{step.title}</h3>
          </div>
          <p style={{
            margin: 0, fontSize: '0.84rem', lineHeight: 1.6,
            color: 'var(--text-muted)', fontWeight: 500,
            animation: 'tourContentSlide 0.35s ease',
          }}>
            {step.description}
          </p>
        </div>

        {/* Footer */}
        <div style={{
          padding: '10px 18px 14px',
          borderTop: '1px solid var(--border, #e5e7eb)',
          display: 'flex', flexDirection: 'column', gap: 8,
        }}>
          {/* Navigation */}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between' }}>
            {!isFirst ? (
              <button onClick={() => onStepChange(currentStep - 1)} style={{
                padding: '8px 14px', borderRadius: 10, border: '1px solid var(--border)',
                background: 'var(--bg, #f9fafb)', color: 'var(--text-main)', fontWeight: 700,
                fontSize: '0.8rem', cursor: 'pointer', fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', gap: 4, transition: 'all 0.15s',
              }}>
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>arrow_back</span>
                Anterior
              </button>
            ) : (
              <button onClick={onClose} style={{
                padding: '8px 14px', borderRadius: 10, border: '1px solid var(--border)',
                background: 'transparent', color: 'var(--text-muted)', fontWeight: 600,
                fontSize: '0.8rem', cursor: 'pointer', fontFamily: 'inherit',
                transition: 'all 0.15s',
              }}>
                Pular tour
              </button>
            )}

            <button onClick={() => {
              if (isLast) { onDismiss(); }
              else onStepChange(currentStep + 1);
            }} style={{
              padding: '8px 18px', borderRadius: 10, border: 'none',
              background: isLast
                ? 'linear-gradient(135deg, #10b981, #34d399)'
                : `linear-gradient(135deg, ${tour.color}, ${tour.color}cc)`,
              color: '#fff', fontWeight: 700, fontSize: '0.8rem',
              cursor: 'pointer', fontFamily: 'inherit',
              boxShadow: isLast ? '0 3px 10px rgba(16,185,129,0.3)' : `0 3px 10px ${tour.color}30`,
              display: 'flex', alignItems: 'center', gap: 4,
              transition: 'all 0.15s',
            }}>
              {isLast ? (
                <><span className="material-symbols-outlined" style={{ fontSize: 14 }}>check_circle</span> Concluir</>
              ) : (
                <>Próximo <span className="material-symbols-outlined" style={{ fontSize: 14 }}>arrow_forward</span></>
              )}
            </button>
          </div>

          {/* Don't show again + dots */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <button
              onClick={onDismiss}
              style={{
                fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)',
                background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '4px 8px', borderRadius: 6,
                opacity: 0.7, transition: 'all 0.2s',
              }}
              onMouseEnter={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.background = 'rgba(0,0,0,0.04)'; }}
              onMouseLeave={e => { e.currentTarget.style.opacity = '0.7'; e.currentTarget.style.background = 'none'; }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 13 }}>visibility_off</span>
              Não mostrar mais
            </button>
            <div style={{ display: 'flex', gap: 4 }}>
              {steps.map((_, i) => (
                <div key={i} onClick={() => onStepChange(i)} style={{
                  width: i === currentStep ? 18 : 6, height: 6, borderRadius: 3,
                  background: i === currentStep ? tour.color : `${tour.color}22`,
                  cursor: 'pointer', transition: 'all 0.3s',
                }} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
