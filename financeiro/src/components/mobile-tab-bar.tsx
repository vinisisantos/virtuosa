'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

type TabKey = 'agenda' | 'vendas' | 'financeiro' | 'dashboard' | 'more';

interface TabItem {
    key: TabKey;
    label: string;
    icon: string;
    href: string;
    matchPaths: string[];
}

const TABS: TabItem[] = [
    { key: 'agenda', label: 'Agenda', icon: 'calendar_month', href: '/agenda', matchPaths: ['/agenda'] },
    { key: 'vendas', label: 'Vendas', icon: 'point_of_sale', href: '/pacotes', matchPaths: ['/pacotes'] },
    { key: 'dashboard', label: 'Dashboard', icon: 'dashboard', href: '/dashboard?tab=dashboard', matchPaths: ['/dashboard'] },
    { key: 'financeiro', label: 'Financeiro', icon: 'account_balance', href: '/pagamentos', matchPaths: ['/pagamentos', '/estoque', '/pedidos'] },
    { key: 'more', label: 'Mais', icon: 'menu', href: '#more', matchPaths: [] },
];

interface MoreSection {
    title: string;
    items: { label: string; icon: string; href: string }[];
}

const MORE_SECTIONS: MoreSection[] = [
    {
        title: 'Dashboard',
        items: [
            { label: 'Visão Geral', icon: 'dashboard', href: '/dashboard?tab=dashboard' },
            { label: 'Metas', icon: 'flag', href: '/dashboard?tab=goals' },
            { label: 'Análise', icon: 'analytics', href: '/dashboard?tab=analytics' },
            { label: 'Comissões', icon: 'payments', href: '/dashboard?tab=commissions' },
            { label: 'Comparativo', icon: 'leaderboard', href: '/dashboard?tab=units' },
            { label: 'Fluxo de Caixa', icon: 'show_chart', href: '/dashboard?tab=forecast' },
            { label: 'Profissionais', icon: 'badge', href: '/dashboard?tab=professionals' },
            { label: 'Mapa de Calor', icon: 'local_fire_department', href: '/dashboard?tab=heatmap' },
        ],
    },
    {
        title: 'Agenda',
        items: [
            { label: 'Agenda', icon: 'calendar_month', href: '/agenda' },
            { label: 'Atendimentos', icon: 'medical_services', href: '/atendimentos' },
            { label: 'Lista de Espera', icon: 'hourglass_top', href: '/dashboard?tab=waitlist' },
            { label: 'Trânsito de Aparelhos', icon: 'precision_manufacturing', href: '/agenda/aparelhos' },
        ],
    },
    {
        title: 'Vendas',
        items: [
            { label: 'Orçamento', icon: 'request_quote', href: '/pacotes/orcamento' },
            { label: 'Vendas', icon: 'point_of_sale', href: '/pacotes' },
            { label: 'Pacientes', icon: 'group', href: '/pacotes/pacientes' },
            { label: 'Procedimentos', icon: 'spa', href: '/pacotes/procedimentos' },
            { label: 'Calculadora', icon: 'calculate', href: '/calculadora' },
        ],
    },
    {
        title: 'CRM',
        items: [
            { label: 'Dashboard', icon: 'dashboard', href: '/crm' },
            { label: 'Inbox', icon: 'chat', href: '/crm/inbox' },
            { label: 'Avaliações', icon: 'event_available', href: '/crm/ouvidoria' },
            { label: 'Contatos', icon: 'contacts', href: '/crm/contacts' },
            { label: 'Pipeline', icon: 'view_kanban', href: '/crm/pipeline' },
            { label: 'Campanhas', icon: 'campaign', href: '/crm/campanhas' },
            { label: 'Broadcasts', icon: 'send', href: '/crm/campanhas/broadcast' },
            { label: 'Automações', icon: 'smart_toy', href: '/crm/automations' },
            { label: 'Estatística', icon: 'insights', href: '/crm/estatistica' },
            { label: 'Avaliações de Atendimento', icon: 'star', href: '/crm/avaliacoes' },
        ],
    },
    {
        title: 'Financeiro',
        items: [
            { label: 'Pagamentos', icon: 'credit_card', href: '/pagamentos' },
            { label: 'Pedidos', icon: 'shopping_bag', href: '/pedidos' },
            { label: 'Folha de Pagamento', icon: 'payments', href: '/?tab=folha' },
            { label: 'Adiantamento', icon: 'account_balance_wallet', href: '/?tab=adiantamento' },
            { label: 'Reembolso', icon: 'receipt_long', href: '/?tab=reembolso' },
            { label: 'Custos', icon: 'account_balance', href: '/?tab=custos' },
        ],
    },
    {
        title: 'Relatório',
        items: [
            { label: 'Relatórios', icon: 'summarize', href: '/relatorios' },
        ],
    },
    {
        title: 'Documentos',
        items: [
            { label: 'Modelo de Contrato', icon: 'draft', href: '/termos' },
            { label: 'Contratos', icon: 'assignment', href: '/contratos' },
            { label: 'Modelos de Documento', icon: 'file_copy', href: '/docs/modelos' },
            { label: 'Gerar Documento', icon: 'edit_document', href: '/docs/gerar' },
            { label: 'Histórico de Docs', icon: 'history', href: '/docs/historico' },
            { label: 'Cancelamentos', icon: 'cancel', href: '/cancelamentos' },
        ],
    },
    {
        title: 'Sistema',
        items: [
            { label: 'Meu Perfil', icon: 'person', href: '/perfil' },
            { label: 'Usuários', icon: 'manage_accounts', href: '/usuarios' },
            { label: 'Configurações', icon: 'settings', href: '/configuracoes' },
        ],
    },
];

export function MobileTabBar() {
    const pathname = usePathname();
    const [isMobile, setIsMobile] = useState(false);
    const [showMore, setShowMore] = useState(false);
    const [permissions, setPermissions] = useState<any>({});
    const [isAdmin, setIsAdmin] = useState(false);

    useEffect(() => {
        const check = () => setIsMobile(window.innerWidth <= 768);
        check();
        window.addEventListener('resize', check);

        try {
            const userStr = localStorage.getItem('virtuosa_user');
            if (userStr) {
                const user = JSON.parse(userStr);
                setPermissions(user.permissions || {});
                setIsAdmin(user.role === 'ADMINISTRADOR');
            }
        } catch (e) {}

        return () => window.removeEventListener('resize', check);
    }, []);

    if (!isMobile) return null;
    if (pathname === '/login' || pathname === '/login.html') return null;
    // Hide on public-facing pages (no system navigation for external users)
    if (pathname.startsWith('/avaliar') || pathname.startsWith('/assinar')) return null;
    // CRM has its own sidebar navigation — hide the financial bottom tab bar
    if (pathname.startsWith('/crm')) return null;

    // Filter main tabs
    const visibleTabs = TABS.filter(t => {
        if (isAdmin || t.key === 'more') return true;
        if (t.key === 'agenda') return permissions.agenda === true;
        if (t.key === 'vendas') return permissions.pedidos === true;
        if (t.key === 'financeiro') return permissions.financeiro === true;
        if (t.key === 'dashboard') return permissions.dashboard === true;
        return false;
    });

    const activeTab = visibleTabs.find(t => t.matchPaths.some(p => pathname.startsWith(p)))?.key
        || (pathname === '/' ? 'financeiro' : '');

    return (
        <>
            {/* "Mais" full-screen overlay with all sections */}
            {showMore && (
                <div className="mobile-more-overlay" onClick={() => setShowMore(false)}>
                    <div className="mobile-more-sheet" onClick={e => e.stopPropagation()}
                        style={{ maxHeight: '85vh', overflowY: 'auto' }}>
                        <div className="mobile-more-handle" />
                        <div className="mobile-more-title">Todas as opções</div>

                        {MORE_SECTIONS.map(section => {
                            const filteredItems = section.items.filter(item => {
                                if (isAdmin) return true;
                                if (item.href === '/crm/automations') return false;
                                if (item.href.startsWith('/dashboard')) return permissions.dashboard === true;
                                if (item.href.startsWith('/agenda') || item.href.startsWith('/atendimentos')) return permissions.agenda === true;
                                if (item.href.startsWith('/pacotes') || item.href.startsWith('/calculadora')) return permissions.pedidos === true;
                                if (item.href.startsWith('/clientes') || item.href.startsWith('/crm') || item.href.startsWith('/ouvidoria')) return permissions.crm === true;
                                if (item.href.startsWith('/pagamentos') || item.href.startsWith('/estoque') || item.href.startsWith('/pedidos') || item.href.startsWith('/?tab')) return permissions.financeiro === true || permissions.pedidos === true;
                                if (item.href.startsWith('/relatorios')) return permissions.dashboardRelatorios === true;
                                if (item.href.startsWith('/termos') || item.href.startsWith('/contratos') || item.href.startsWith('/docs/')) return permissions.termos === true;
                                if (item.href.startsWith('/cancelamentos')) return permissions.cancelamento === true;
                                if (item.href.startsWith('/perfil')) return permissions.perfil === true;
                                if (item.href.startsWith('/usuarios') || item.href.startsWith('/configuracoes')) return permissions.usuarios === true;
                                return false;
                            });

                            if (filteredItems.length === 0) return null;

                            return (
                                <div key={section.title} style={{ marginBottom: 16 }}>
                                <div style={{
                                    fontSize: '0.68rem', fontWeight: 800, color: 'var(--text-muted)',
                                    textTransform: 'uppercase', letterSpacing: '0.5px',
                                    padding: '0 4px 6px', borderBottom: '1px solid var(--border)',
                                    marginBottom: 6,
                                }}>
                                    {section.title}
                                </div>
                                <div className="mobile-more-grid">
                                    {filteredItems.map(item => {
                                        const isTabLink = item.href.includes('?tab=');
                                        if (isTabLink) {
                                            return (
                                                <a
                                                    key={item.href + item.label}
                                                    href={item.href}
                                                    className="mobile-more-item"
                                                    onClick={(e) => { e.preventDefault(); setShowMore(false); window.location.href = item.href; }}
                                                >
                                                    <span className="material-symbols-outlined mobile-more-icon">{item.icon}</span>
                                                    <span className="mobile-more-label">{item.label}</span>
                                                </a>
                                            );
                                        }
                                        return (
                                            <Link
                                                key={item.href + item.label}
                                                href={item.href}
                                                className="mobile-more-item"
                                                onClick={() => setShowMore(false)}
                                            >
                                                <span className="material-symbols-outlined mobile-more-icon">{item.icon}</span>
                                                <span className="mobile-more-label">{item.label}</span>
                                            </Link>
                                        );
                                    })}
                                </div>
                            </div>
                            );
                        })}

                        {/* Logout */}
                        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 8 }}>
                            <button
                                onClick={() => {
                                    setShowMore(false);
                                    fetch('/api/auth/logout', { method: 'POST' }).finally(() => {
                                        localStorage.removeItem('virtuosa_user');
                                        window.location.href = '/login.html';
                                    });
                                }}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                                    padding: '12px 16px', border: 'none', borderRadius: 12,
                                    background: 'rgba(239,68,68,0.08)', color: '#ef4444',
                                    fontWeight: 700, fontSize: '0.88rem', cursor: 'pointer',
                                    fontFamily: 'inherit',
                                }}
                            >
                                <span className="material-symbols-outlined" style={{ fontSize: 20 }}>logout</span>
                                Sair da conta
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Tab bar */}
            <nav className="mobile-tab-bar">
                {visibleTabs.map(tab => {
                    const isActive = tab.key === activeTab;
                    if (tab.key === 'more') {
                        return (
                            <button
                                key={tab.key}
                                className={`mobile-tab-item ${showMore ? 'active' : ''}`}
                                onClick={() => setShowMore(!showMore)}
                            >
                                <span className="material-symbols-outlined mobile-tab-icon">
                                    {showMore ? 'close' : tab.icon}
                                </span>
                                <span className="mobile-tab-label">{tab.label}</span>
                            </button>
                        );
                    }

                    const isTabLink = tab.href.includes('?tab=');
                    if (isTabLink) {
                        return (
                            <a
                                key={tab.key}
                                href={tab.href}
                                className={`mobile-tab-item ${isActive ? 'active' : ''}`}
                                onClick={() => setShowMore(false)}
                            >
                                <span className="material-symbols-outlined mobile-tab-icon">{tab.icon}</span>
                                <span className="mobile-tab-label">{tab.label}</span>
                                {isActive && <span className="mobile-tab-indicator" />}
                            </a>
                        );
                    }

                    return (
                        <Link
                            key={tab.key}
                            href={tab.href}
                            className={`mobile-tab-item ${isActive ? 'active' : ''}`}
                            onClick={() => setShowMore(false)}
                        >
                            <span className="material-symbols-outlined mobile-tab-icon">{tab.icon}</span>
                            <span className="mobile-tab-label">{tab.label}</span>
                            {isActive && <span className="mobile-tab-indicator" />}
                        </Link>
                    );
                })}
            </nav>
        </>
    );
}
