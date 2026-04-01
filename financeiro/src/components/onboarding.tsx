'use client';
import { useState, useEffect, createContext, useContext, useCallback } from 'react';

/* ─── Onboarding Content per Page ─── */
interface OnboardingStep {
  icon: string;
  title: string;
  description: string;
  permission?: string; // Only show if user has this permission
  roles?: string[];    // Only show if user has one of these roles
}

interface PageOnboarding {
  pageKey: string;
  pageTitle: string;
  pageIcon: string;
  color: string;
  steps: OnboardingStep[];
  roles?: string[]; // Only show if user has one of these roles
}

const ONBOARDING_DATA: PageOnboarding[] = [
  {
    pageKey: 'agenda', pageTitle: 'Agenda', pageIcon: 'calendar_month', color: '#e600a0',
    steps: [
      { icon: 'calendar_today', title: 'Visualizações', description: 'Alterne entre visão Dia, Semana, Mês e Lista usando os botões no topo. Clique num dia no mini-calendário lateral para navegar rapidamente.' },
      { icon: 'add_circle', title: 'Novo Agendamento', description: 'Clique em qualquer horário vazio na grade para abrir o formulário de novo agendamento. Preencha cliente, procedimento, profissional e horário.' },
      { icon: 'drag_indicator', title: 'Arrastar e Soltar', description: 'Segure e arraste um agendamento para remarcar para outro horário. O sistema salva automaticamente.' },
      { icon: 'notifications_active', title: 'Lembretes', description: 'Na sidebar, clique em "Ver próximas 24h" para ver agendamentos que precisam de lembrete via WhatsApp.' },
      { icon: 'check_circle', title: 'Dar Baixa', description: 'Ao finalizar um procedimento, clique em "Dar Baixa" para marcar como concluído. Agendamentos expirados são finalizados automaticamente.', permission: 'darBaixa' },
    ],
  },
  {
    pageKey: 'dashboard', pageTitle: 'Dashboard', pageIcon: 'dashboard', color: '#6366f1',
    steps: [
      { icon: 'monitoring', title: 'Visão Geral', description: 'O Dashboard mostra os KPIs principais: faturamento, cancelamentos, ticket médio e muito mais. Use o seletor de mês para navegar entre períodos.' },
      { icon: 'pie_chart', title: 'Gráficos', description: 'Os gráficos de pizza e barras mostram a distribuição de vendas por vendedor, procedimento e forma de pagamento. Passe o mouse para ver detalhes.' },
      { icon: 'location_on', title: 'Unidade', description: 'Use o seletor de unidade no topo do sistema para filtrar os dados por unidade. Todas as métricas serão atualizadas automaticamente.' },
    ],
  },
  {
    pageKey: 'financeiro', pageTitle: 'Financeiro', pageIcon: 'payments', color: '#6366f1',
    steps: [
      { icon: 'payments', title: 'Folha de Pagamento', description: 'Importe a folha via PDF ou adicione colaboradores manualmente. O sistema calcula INSS, IRRF, VT, FGTS e provisões automaticamente.' },
      { icon: 'receipt_long', title: 'Holerite', description: 'Na seção Holerite, veja o demonstrativo líquido de cada colaborador com todos os descontos legais, premiação e adiantamento.' },
      { icon: 'commute', title: 'VT e VR', description: 'As abas VT e VR permitem controlar os vales individualmente com histórico mensal. Use "Gerar Automático" para preencher todos de uma vez.' },
      { icon: 'account_balance', title: 'Custos', description: 'A aba Custos unifica Custos Fixos, Contas a Pagar e Custos Futuros. Tudo filtrado pela unidade selecionada no header.' },
      { icon: 'analytics', title: 'Análise Financeira', description: 'A aba Análise mostra margem de lucro, ponto de equilíbrio e projeções baseados nos seus dados reais de receita e despesas.' },
    ],
    roles: ['ADMINISTRADOR', 'GERENTE'],
  },
  {
    pageKey: 'clientes', pageTitle: 'CRM & Clientes', pageIcon: 'groups', color: '#10b981',
    steps: [
      { icon: 'view_kanban', title: 'Kanban de Leads', description: 'Arraste os cards entre as colunas para atualizar o status do lead. Clique num card para ver detalhes e adicionar anotações.' },
      { icon: 'person_add', title: 'Novo Lead', description: 'Clique em "+ Novo Lead" para adicionar um cliente potencial. Preencha nome, telefone e origem, e o lead entra no funil automaticamente.' },
      { icon: 'bar_chart', title: 'Estatísticas', description: 'A seção de estatísticas mostra taxa de conversão, tempo médio de fechamento e origem dos leads. Use para otimizar suas estratégias.' },
    ],
  },
  {
    pageKey: 'cancelamentos', pageTitle: 'Cancelamentos', pageIcon: 'cancel', color: '#ef4444',
    steps: [
      { icon: 'upload_file', title: 'Importar Dados', description: 'Importe seus dados de cancelamento via CSV ou Excel. O sistema identifica automaticamente as colunas e formata os valores.' },
      { icon: 'filter_alt', title: 'Filtros', description: 'Filtre por período, motivo, procedimento ou vendedor para analisar os padrões de cancelamento da sua clínica.' },
      { icon: 'insights', title: 'Análise de Tendências', description: 'Os gráficos mostram a evolução dos cancelamentos ao longo do tempo, permitindo identificar períodos críticos.' },
    ],
  },
  {
    pageKey: 'pacotes', pageTitle: 'Pacotes', pageIcon: 'inventory_2', color: '#8b5cf6',
    steps: [
      { icon: 'add_box', title: 'Criar Pacote', description: 'Defina um pacote com nome, procedimentos inclusos, número de sessões e valor. Os pacotes ficam disponíveis para venda na ficha do paciente.' },
      { icon: 'person', title: 'Pacientes', description: 'Em "Pacientes", veja todos os pacientes cadastrados. Clique num nome para abrir a ficha completa com histórico de sessões e contrato.' },
      { icon: 'event_note', title: 'Sessões', description: 'Na ficha do paciente, controle as sessões realizadas. O sistema mostra o progresso e alerta quando o pacote está acabando.' },
      { icon: 'request_quote', title: 'Orçamento', description: 'Use a aba "Orçamento" para gerar propostas de pacotes personalizadas com desconto e condições de pagamento.' },
    ],
  },
  {
    pageKey: 'catalogo', pageTitle: 'Catálogo', pageIcon: 'menu_book', color: '#0ea5e9',
    steps: [
      { icon: 'spa', title: 'Serviços', description: 'Cadastre todos os procedimentos da clínica com nome, duração, preço e categoria. Esses serviços aparecem na agenda e nos pacotes.' },
      { icon: 'category', title: 'Categorias', description: 'Organize seus serviços em categorias (ex: Depilação, Facial, Corporal) para facilitar a busca e organização.' },
    ],
  },
  {
    pageKey: 'contratos', pageTitle: 'Contratos', pageIcon: 'gavel', color: '#f59e0b',
    steps: [
      { icon: 'description', title: 'Gerar Contrato', description: 'Clique em "Gerar Contrato" na ficha do paciente. O sistema preenche automaticamente os dados do template com as informações do cliente.' },
      { icon: 'draw', title: 'Assinatura', description: 'O paciente pode assinar digitalmente pelo celular. Após assinado, o contrato fica salvo e disponível para download.' },
    ],
  },
  {
    pageKey: 'estoque', pageTitle: 'Estoque', pageIcon: 'inventory', color: '#10b981',
    steps: [
      { icon: 'add_shopping_cart', title: 'Entrada de Produtos', description: 'Registre a entrada de novos produtos com nome, quantidade, valor unitário e fornecedor. O estoque é atualizado automaticamente.' },
      { icon: 'remove_shopping_cart', title: 'Saída de Produtos', description: 'Registre as saídas conforme os produtos são utilizados nos procedimentos. O sistema alerta quando o estoque está baixo.' },
    ],
  },
  {
    pageKey: 'pagamentos', pageTitle: 'Lançamentos', pageIcon: 'point_of_sale', color: '#e600a0',
    steps: [
      { icon: 'add_card', title: 'Novo Lançamento', description: 'Registre vendas com cliente, procedimento, vendedor, valor, forma de pagamento e unidade. Tudo é sincronizado com o Dashboard.' },
      { icon: 'receipt', title: 'Histórico', description: 'Veja todos os lançamentos com filtros por período, vendedor e unidade. Exporte para CSV quando necessário.' },
    ],
  },
  {
    pageKey: 'usuarios', pageTitle: 'Gestão de Usuários', pageIcon: 'admin_panel_settings', color: '#ef4444',
    steps: [
      { icon: 'person_add', title: 'Criar Usuário', description: 'Adicione novos usuários com nome, email, senha, cargo e unidade. Defina as permissões de acesso individualmente.' },
      { icon: 'lock', title: 'Permissões', description: 'Cada permissão controla o acesso a uma seção do sistema. Administradores têm acesso total. Configure com cuidado.' },
    ],
    roles: ['ADMINISTRADOR'],
  },
  {
    pageKey: 'configuracoes', pageTitle: 'Configurações', pageIcon: 'settings', color: '#6366f1',
    steps: [
      { icon: 'tune', title: 'Configurações Gerais', description: 'Ajuste as configurações do sistema como nome da empresa, logo, cores e preferências de notificação.' },
    ],
  },
];

const STORAGE_KEY = 'virtuosa_onboarding_dismissed';

function getDismissed(): Record<string, boolean> {
  if (typeof window === 'undefined') return {};
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; }
}

/* ─── Context ─── */
interface OnboardingContextType {
  triggerOnboarding: (pageKey: string) => void;
}

const OnboardingContext = createContext<OnboardingContextType>({ triggerOnboarding: () => {} });
export const useOnboarding = () => useContext(OnboardingContext);

/* ─── Provider + Modal ─── */
export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const [activePageKey, setActivePageKey] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [dontShowAgain, setDontShowAgain] = useState(false);
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
    const page = ONBOARDING_DATA.find(p => p.pageKey === pageKey);
    if (!page) return;

    // Check if user has role access to this page's onboarding
    if (page.roles && page.roles.length > 0) {
      const isAdmin = userPerms.admin === true || userRole === 'ADMINISTRADOR';
      if (!isAdmin && !page.roles.includes(userRole)) return;
    }

    setActivePageKey(pageKey);
    setCurrentStep(0);
    setDontShowAgain(false);
  }, [dismissed, userRole, userPerms]);

  const handleClose = () => {
    if (dontShowAgain && activePageKey) {
      const updated = { ...dismissed, [activePageKey]: true };
      setDismissed(updated);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    }
    setActivePageKey(null);
    setCurrentStep(0);
  };

  const page = activePageKey ? ONBOARDING_DATA.find(p => p.pageKey === activePageKey) : null;

  // Filter steps by user permissions
  const visibleSteps = page ? page.steps.filter(step => {
    if (step.permission) {
      const isAdmin = userPerms.admin === true || userRole === 'ADMINISTRADOR';
      if (!isAdmin && !userPerms[step.permission]) return false;
    }
    if (step.roles && step.roles.length > 0) {
      const isAdmin = userPerms.admin === true || userRole === 'ADMINISTRADOR';
      if (!isAdmin && !step.roles.includes(userRole)) return false;
    }
    return true;
  }) : [];

  const step = visibleSteps[currentStep];
  const isLastStep = currentStep >= visibleSteps.length - 1;

  return (
    <OnboardingContext.Provider value={{ triggerOnboarding }}>
      {children}

      {/* Modal Overlay */}
      {page && step && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 99999,
          background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          animation: 'onbFadeIn 0.3s ease',
        }}>
          <style>{`
            @keyframes onbFadeIn { from { opacity: 0; } to { opacity: 1; } }
            @keyframes onbSlideUp { from { opacity: 0; transform: translateY(20px) scale(0.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
            @keyframes onbPulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.05); } }
            @keyframes onbShimmer { 0% { background-position: -200% center; } 100% { background-position: 200% center; } }
          `}</style>

          <div style={{
            width: '95%', maxWidth: 520, borderRadius: 24,
            background: 'var(--card-bg, #fff)', border: '1px solid var(--border, #e5e7eb)',
            boxShadow: '0 25px 50px rgba(0,0,0,0.25)', overflow: 'hidden',
            animation: 'onbSlideUp 0.4s ease',
          }}>
            {/* Header with gradient */}
            <div style={{
              padding: '28px 28px 20px',
              background: `linear-gradient(135deg, ${page.color}12, ${page.color}06)`,
              borderBottom: `1px solid ${page.color}15`,
              position: 'relative',
            }}>
              {/* Step counter */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: 12,
                    background: `linear-gradient(135deg, ${page.color}, ${page.color}bb)`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: `0 4px 12px ${page.color}33`,
                  }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#fff' }}>{page.pageIcon}</span>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.68rem', fontWeight: 700, color: page.color, textTransform: 'uppercase', letterSpacing: '1px' }}>Guia • {page.pageTitle}</span>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                      Passo {currentStep + 1} de {visibleSteps.length}
                    </div>
                  </div>
                </div>
                <button onClick={handleClose} style={{
                  width: 32, height: 32, borderRadius: 8, border: 'none',
                  background: 'rgba(0,0,0,0.06)', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--text-muted)' }}>close</span>
                </button>
              </div>

              {/* Progress bar */}
              <div style={{ height: 4, borderRadius: 2, background: `${page.color}15`, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: 2,
                  background: `linear-gradient(90deg, ${page.color}, ${page.color}bb)`,
                  width: `${((currentStep + 1) / visibleSteps.length) * 100}%`,
                  transition: 'width 0.4s ease',
                }} />
              </div>
            </div>

            {/* Step Content */}
            <div style={{ padding: '24px 28px' }} key={currentStep}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14,
                animation: 'onbSlideUp 0.3s ease',
              }}>
                <div style={{
                  width: 52, height: 52, borderRadius: 16,
                  background: `${page.color}10`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 26, color: page.color }}>{step.icon}</span>
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-main)' }}>{step.title}</h3>
                </div>
              </div>
              <p style={{
                margin: 0, fontSize: '0.88rem', lineHeight: 1.65,
                color: 'var(--text-muted)', fontWeight: 500,
                animation: 'onbSlideUp 0.35s ease',
              }}>
                {step.description}
              </p>
            </div>

            {/* Footer */}
            <div style={{
              padding: '16px 28px 24px',
              borderTop: '1px solid var(--border, #e5e7eb)',
              display: 'flex', flexDirection: 'column', gap: 12,
            }}>
              {/* Navigation buttons */}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between' }}>
                {currentStep > 0 ? (
                  <button onClick={() => setCurrentStep(currentStep - 1)} style={{
                    padding: '10px 20px', borderRadius: 12, border: '1px solid var(--border)',
                    background: 'var(--bg)', color: 'var(--text-main)', fontWeight: 700,
                    fontSize: '0.85rem', cursor: 'pointer', fontFamily: 'inherit',
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>arrow_back</span>Anterior
                  </button>
                ) : <div />}

                <button onClick={() => {
                  if (isLastStep) handleClose();
                  else setCurrentStep(currentStep + 1);
                }} style={{
                  padding: '10px 24px', borderRadius: 12, border: 'none',
                  background: isLastStep
                    ? `linear-gradient(135deg, #10b981, #34d399)`
                    : `linear-gradient(135deg, ${page.color}, ${page.color}bb)`,
                  color: '#fff', fontWeight: 700, fontSize: '0.85rem',
                  cursor: 'pointer', fontFamily: 'inherit',
                  boxShadow: isLastStep ? '0 4px 12px rgba(16,185,129,0.3)' : `0 4px 12px ${page.color}33`,
                  display: 'flex', alignItems: 'center', gap: 6,
                  transition: 'all 0.2s',
                }}>
                  {isLastStep ? (
                    <>
                      <span className="material-symbols-outlined" style={{ fontSize: 16 }}>check_circle</span>
                      Ok, entendi!
                    </>
                  ) : (
                    <>
                      Próximo
                      <span className="material-symbols-outlined" style={{ fontSize: 16 }}>arrow_forward</span>
                    </>
                  )}
                </button>
              </div>

              {/* Don't show again toggle */}
              <div
                onClick={() => setDontShowAgain(!dontShowAgain)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
                  padding: '8px 12px', borderRadius: 10,
                  background: dontShowAgain ? 'rgba(16,185,129,0.06)' : 'transparent',
                  transition: 'all 0.2s', userSelect: 'none',
                }}
              >
                <div style={{
                  width: 40, height: 22, borderRadius: 11, position: 'relative',
                  background: dontShowAgain ? 'linear-gradient(135deg,#10b981,#34d399)' : 'var(--border)',
                  transition: 'all 0.3s',
                  boxShadow: dontShowAgain ? '0 2px 6px rgba(16,185,129,0.3)' : 'none',
                }}>
                  <div style={{
                    width: 16, height: 16, borderRadius: 8, background: '#fff',
                    position: 'absolute', top: 3, transition: 'all 0.3s',
                    left: dontShowAgain ? 21 : 3,
                    boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                  }} />
                </div>
                <span style={{
                  fontSize: '0.78rem', fontWeight: 600,
                  color: dontShowAgain ? '#10b981' : 'var(--text-muted)',
                }}>
                  Não mostrar novamente esta mensagem
                </span>
              </div>

              {/* Step dots */}
              <div style={{ display: 'flex', justifyContent: 'center', gap: 6 }}>
                {visibleSteps.map((_, i) => (
                  <div key={i} onClick={() => setCurrentStep(i)} style={{
                    width: i === currentStep ? 24 : 8, height: 8, borderRadius: 4,
                    background: i === currentStep ? page.color : `${page.color}25`,
                    cursor: 'pointer', transition: 'all 0.3s',
                  }} />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </OnboardingContext.Provider>
  );
}
