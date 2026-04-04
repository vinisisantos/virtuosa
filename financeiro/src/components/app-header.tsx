'use client';

import { useState, useEffect, useRef } from 'react';
import { useTour } from '@/components/guided-tour';
import Link from 'next/link';
import { NotificationBell } from '@/components/notification-bell';
import { ThemeCustomizer } from '@/components/theme-customizer';
import { useGlobalUnit } from '@/contexts/UnitContext';

type ActivePage = 'dashboard' | 'agenda' | 'cancelamentos' | 'pedidos' | 'insumos' | 'financeiro' | 'perfil' | 'usuarios' | 'chat' | 'termos' | 'clientes' | 'crm-estatistica' | 'estoque' | 'pagamentos' | 'catalogo' | 'pacotes' | 'pacotes-vendas' | 'pacotes-orcamento' | 'pacotes-procedimentos' | 'pacotes-pacientes' | 'contratos';

interface AppHeaderProps {
    activePage?: ActivePage;
}

// Top-level nav links (flat, no dropdown) — kept minimal for clean nav
const TOP_NAV_LINKS: { key: ActivePage; label: string; href: string; permission: string }[] = [
];

// Agenda dropdown sub-items
const AGENDA_SUB_LINKS: { key: string; label: string; href: string; icon: string; permission: string }[] = [
    { key: 'agenda', label: 'Agenda', href: '/agenda', icon: 'calendar_month', permission: 'agenda' },
    { key: 'agenda-waitlist', label: 'Lista de Espera', href: '/dashboard?tab=waitlist', icon: 'hourglass_top', permission: 'agenda' },
];

// Dashboard dropdown sub-items
const DASHBOARD_SUB_LINKS: { key: string; label: string; href: string; icon: string; permission: string; divider?: boolean }[] = [
    { key: 'dash-overview', label: 'Visão Geral', href: '/dashboard?tab=dashboard', icon: 'dashboard', permission: 'dashboard' },
    { key: 'dash-goals', label: 'Metas', href: '/dashboard?tab=goals', icon: 'flag', permission: 'dashboard' },
    { key: 'dash-reports', label: 'Relatórios', href: '/dashboard?tab=reports', icon: 'summarize', permission: 'dashboard' },
    { key: 'dash-analytics', label: 'Análise', href: '/dashboard?tab=analytics', icon: 'analytics', permission: 'dashboard' },
    { key: 'dash-commissions', label: 'Comissões', href: '/dashboard?tab=commissions', icon: 'payments', permission: 'dashboard', divider: true },
    { key: 'dash-units', label: 'Comparativo', href: '/dashboard?tab=units', icon: 'leaderboard', permission: 'dashboard' },
    { key: 'dash-forecast', label: 'Fluxo de Caixa', href: '/dashboard?tab=forecast', icon: 'show_chart', permission: 'dashboard' },
    { key: 'dash-professionals', label: 'Profissionais', href: '/dashboard?tab=professionals', icon: 'badge', permission: 'dashboard' },
    { key: 'dash-heatmap', label: 'Mapa de Calor', href: '/dashboard?tab=heatmap', icon: 'local_fire_department', permission: 'dashboard' },
];

// Financeiro dropdown sub-items
const FINANCEIRO_SUB_LINKS: { key: string; label: string; href: string; icon: string; permission: string; divider?: boolean }[] = [
    { key: 'pagamentos', label: 'Pagamentos', href: '/pagamentos', icon: 'credit_card', permission: 'financeiro' },
    { key: 'estoque', label: 'Estoque', href: '/estoque', icon: 'inventory_2', permission: 'financeiro' },
    { key: 'pedidos', label: 'Pedidos', href: '/pedidos', icon: 'shopping_bag', permission: 'pedidos', divider: true },
    { key: 'fin-folha', label: 'Folha de Pagamento', href: '/?tab=folha', icon: 'payments', permission: 'financeiro' },
    { key: 'fin-adiantamento', label: 'Adiantamento', href: '/?tab=adiantamento', icon: 'account_balance_wallet', permission: 'finAdiantamento' },
    { key: 'fin-premiacao', label: 'Premiação', href: '/?tab=premiacao', icon: 'emoji_events', permission: 'finPremiacao' },
    { key: 'fin-reembolso', label: 'Reembolso', href: '/?tab=reembolso', icon: 'receipt_long', permission: 'finReembolso' },
    { key: 'fin-custos', label: 'Custos', href: '/?tab=custos', icon: 'account_balance', permission: 'finCustos' },
    { key: 'fin-analise', label: 'Análise', href: '/?tab=analise', icon: 'analytics', permission: 'finAnalise' },
    { key: 'fin-lancamento', label: 'Lançamento', href: '/dashboard?tab=sales', icon: 'edit_note', permission: 'financeiro' },
];

// Docs dropdown sub-items
const DOCS_SUB_LINKS: { key: string; label: string; href: string; icon: string; permission: string; divider?: boolean }[] = [
    { key: 'termos', label: 'Modelo de Contrato', href: '/termos', icon: 'draft', permission: 'termos' },
    { key: 'contratos', label: 'Contratos', href: '/contratos', icon: 'assignment', permission: 'termos' },
    { key: 'cancelamentos', label: 'Cancelamentos', href: '/cancelamentos', icon: 'cancel', permission: 'cancelamento', divider: true },
];

// CRM dropdown sub-items
const CRM_SUB_LINKS: { key: string; label: string; href: string; icon: string; permission: string; divider?: boolean }[] = [
    { key: 'crm-pipeline', label: 'Pipeline', href: '/clientes', icon: 'view_kanban', permission: 'dashboard' },
    { key: 'crm-whatsapp', label: 'WhatsApp', href: '/crm/whatsapp', icon: 'chat', permission: 'dashboard' },
    { key: 'crm-estatistica', label: 'Estatística', href: '/crm/estatistica', icon: 'insights', permission: 'dashboard', divider: true },
    { key: 'crm-birthdays', label: 'Aniversários', href: '/dashboard?tab=birthdays', icon: 'cake', permission: 'dashboard' },
    { key: 'crm-loyalty', label: 'Fidelidade', href: '/dashboard?tab=loyalty', icon: 'stars', permission: 'dashboard' },
    { key: 'crm-retention', label: 'Retenção', href: '/dashboard?tab=retention', icon: 'loyalty', permission: 'dashboard' },
    { key: 'crm-comms', label: 'Comunicações', href: '/dashboard?tab=communications', icon: 'forum', permission: 'dashboard' },
    { key: 'crm-nps', label: 'NPS', href: '/dashboard?tab=nps', icon: 'bar_chart', permission: 'dashboard' },
    { key: 'crm-activity', label: 'Atividades', href: '/dashboard?tab=activity', icon: 'history', permission: 'dashboard' },
];

// Vendas dropdown sub-items (formerly Pacotes)
const PACOTES_SUB_LINKS: { key: string; label: string; href: string; icon: string; permission: string }[] = [
    { key: 'pacotes-orcamento', label: 'Orçamento', href: '/pacotes/orcamento', icon: 'request_quote', permission: 'dashboardVendas' },
    { key: 'pacotes-vendas', label: 'Vendas', href: '/pacotes', icon: 'point_of_sale', permission: 'dashboardVendas' },
    { key: 'pacotes-pacientes', label: 'Pacientes', href: '/pacotes/pacientes', icon: 'group', permission: 'dashboardVendas' },
    { key: 'pacotes-procedimentos', label: 'Procedimentos', href: '/pacotes/procedimentos', icon: 'spa', permission: 'dashboardVendas' },
];

const CRM_ACTIVE_KEYS: ActivePage[] = ['clientes', 'crm-estatistica'];
const FINANCEIRO_ACTIVE_KEYS: ActivePage[] = ['financeiro', 'estoque', 'pagamentos', 'pedidos'];
const DOCS_ACTIVE_KEYS: ActivePage[] = ['termos', 'contratos', 'cancelamentos'];
const PACOTES_ACTIVE_KEYS: ActivePage[] = ['pacotes', 'pacotes-vendas', 'pacotes-orcamento', 'pacotes-procedimentos', 'pacotes-pacientes', 'catalogo'];
const AGENDA_ACTIVE_KEYS: ActivePage[] = ['agenda'];

export function AppHeader({ activePage = 'dashboard' }: AppHeaderProps) {
    const [showProfileDropdown, setShowProfileDropdown] = useState(false);
    const [showDashboardDropdown, setShowDashboardDropdown] = useState(false);
    const [showCrmDropdown, setShowCrmDropdown] = useState(false);
    const [showFinanceiroDropdown, setShowFinanceiroDropdown] = useState(false);
    const [showPacotesDropdown, setShowPacotesDropdown] = useState(false);
    const [showAgendaDropdown, setShowAgendaDropdown] = useState(false);
    const [showDocsDropdown, setShowDocsDropdown] = useState(false);
    const [showMobileNav, setShowMobileNav] = useState(false);
    const [showUnitDropdown, setShowUnitDropdown] = useState(false);
    const { startTour, resetTour } = useTour();

    const [isAdmin, setIsAdmin] = useState(false);
    const [userName, setUserName] = useState('');
    const [userEmail, setUserEmail] = useState('');
    const [userRole, setUserRole] = useState('');
    const [userUnit, setUserUnit] = useState('');
    const [userPermissions, setUserPermissions] = useState<Record<string, boolean>>({});
    const [isDark, setIsDark] = useState(false);
    const [showSearch, setShowSearch] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const searchInputRef = useRef<HTMLInputElement>(null);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const dashDropdownRef = useRef<HTMLDivElement>(null);
    const crmDropdownRef = useRef<HTMLDivElement>(null);
    const finDropdownRef = useRef<HTMLDivElement>(null);
    const pacDropdownRef = useRef<HTMLDivElement>(null);
    const agendaDropdownRef = useRef<HTMLDivElement>(null);
    const docsDropdownRef = useRef<HTMLDivElement>(null);
    const unitDropdownRef = useRef<HTMLDivElement>(null);
    const { globalUnit, setGlobalUnit, units: UNITS_LIST } = useGlobalUnit();

    useEffect(() => {
        const raw = localStorage.getItem('virtuosa_user');
        if (raw) {
            try {
                const user = JSON.parse(raw);
                setUserName(user.name || '');
                setUserEmail(user.email || '');
                setUserRole(user.role || 'VENDEDOR');
                setUserUnit(user.unit || '');
                const perms = user.permissions || {};
                setUserPermissions(perms);
                if (perms.admin === true || user.role === 'ADMINISTRADOR') {
                    setIsAdmin(true);
                }
            } catch (e) {
                console.error('Error parsing user data:', e);
            }
        }
    }, []);

    // Click outside to close dropdowns
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
                setShowProfileDropdown(false);
            }
            if (dashDropdownRef.current && !dashDropdownRef.current.contains(e.target as Node)) {
                setShowDashboardDropdown(false);
            }
            if (crmDropdownRef.current && !crmDropdownRef.current.contains(e.target as Node)) {
                setShowCrmDropdown(false);
            }
            if (finDropdownRef.current && !finDropdownRef.current.contains(e.target as Node)) {
                setShowFinanceiroDropdown(false);
            }
            if (pacDropdownRef.current && !pacDropdownRef.current.contains(e.target as Node)) {
                setShowPacotesDropdown(false);
            }
            if (agendaDropdownRef.current && !agendaDropdownRef.current.contains(e.target as Node)) {
                setShowAgendaDropdown(false);
            }
            if (docsDropdownRef.current && !docsDropdownRef.current.contains(e.target as Node)) {
                setShowDocsDropdown(false);
            }
            if (unitDropdownRef.current && !unitDropdownRef.current.contains(e.target as Node)) {
                setShowUnitDropdown(false);
            }
        };
        document.addEventListener('click', handleClickOutside);
        return () => document.removeEventListener('click', handleClickOutside);
    }, []);

    // Dynamic page title
    useEffect(() => {
        const titles: Record<ActivePage, string> = {
            dashboard: 'Dashboard',
            agenda: 'Agenda',
            cancelamentos: 'Cancelamentos',
            pedidos: 'Pedidos',
            insumos: 'Insumos',
            financeiro: 'Financeiro',
            perfil: 'Perfil',
            usuarios: 'Usuários',
            chat: 'Chat IA',
            termos: 'Modelo de Contrato',
            contratos: 'Contratos',
            clientes: 'CRM — Pipeline',
            'crm-estatistica': 'CRM — Estatística',
            estoque: 'Estoque',
            pagamentos: 'Pagamentos',

            catalogo: 'Catálogo de Serviços',
            pacotes: 'Vendas',
            'pacotes-vendas': 'Vendas',
            'pacotes-orcamento': 'Vendas — Orçamento',
            'pacotes-procedimentos': 'Vendas — Procedimentos',
            'pacotes-pacientes': 'Vendas — Pacientes',
        };
        document.title = titles[activePage] || 'Virtuosa';
    }, [activePage]);

    // Auto-trigger tour on page visit
    useEffect(() => {
        const tourMap: Record<string, string> = {
            dashboard: 'dashboard',
            agenda: 'agenda',
            pacotes: 'pacotes', 'pacotes-vendas': 'pacotes',
            'pacotes-orcamento': 'pacotes-orcamento',
            'pacotes-pacientes': 'pacotes-pacientes',
            clientes: 'clientes',
            financeiro: 'financeiro',
            estoque: 'estoque',
            contratos: 'contratos',
            cancelamentos: 'cancelamentos',
            usuarios: 'usuarios',
        };
        const key = tourMap[activePage];
        if (key) {
            const t = setTimeout(() => startTour(key), 1000);
            return () => clearTimeout(t);
        }
    }, [activePage, startTour]);

    // Dark mode: load preference
    useEffect(() => {
        const saved = localStorage.getItem('virtuosa_theme');
        if (saved === 'dark') {
            setIsDark(true);
            document.documentElement.setAttribute('data-theme', 'dark');
        }
    }, []);

    const initials = userName
        ? userName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
        : 'U';

    const formattedRole = userRole
        ? userRole.charAt(0) + userRole.slice(1).toLowerCase()
        : '';

    // Filter top nav links
    const visibleTopLinks = isAdmin
        ? TOP_NAV_LINKS
        : TOP_NAV_LINKS.filter(link => userPermissions[link.permission] === true);

    // Filter dashboard sub-links
    const visibleDashSubLinks = isAdmin
        ? DASHBOARD_SUB_LINKS
        : DASHBOARD_SUB_LINKS.filter(link => userPermissions[link.permission] === true);

    const showDashboard = visibleDashSubLinks.length > 0;
    const isDashboardActive = activePage === 'dashboard';

    // Filter financeiro sub-links
    const visibleFinSubLinks = isAdmin
        ? FINANCEIRO_SUB_LINKS
        : FINANCEIRO_SUB_LINKS.filter(link => userPermissions[link.permission] === true);

    const showFinanceiro = visibleFinSubLinks.length > 0;
    const isFinanceiroActive = FINANCEIRO_ACTIVE_KEYS.includes(activePage);

    // Filter CRM sub-links
    const visibleCrmSubLinks = isAdmin
        ? CRM_SUB_LINKS
        : CRM_SUB_LINKS.filter(link => userPermissions[link.permission] === true);
    const showCrm = visibleCrmSubLinks.length > 0;
    const isCrmActive = CRM_ACTIVE_KEYS.includes(activePage);

    // Filter pacotes sub-links
    const visiblePacSubLinks = isAdmin
        ? PACOTES_SUB_LINKS
        : PACOTES_SUB_LINKS.filter(link => userPermissions[link.permission] === true);
    const showPacotes = visiblePacSubLinks.length > 0;
    const isPacotesActive = PACOTES_ACTIVE_KEYS.includes(activePage);

    // Filter agenda sub-links
    const visibleAgendaSubLinks = isAdmin
        ? AGENDA_SUB_LINKS
        : AGENDA_SUB_LINKS.filter(link => userPermissions[link.permission] === true);
    const showAgenda = visibleAgendaSubLinks.length > 0;
    const isAgendaActive = AGENDA_ACTIVE_KEYS.includes(activePage);

    // Filter docs sub-links
    const visibleDocsSubLinks = isAdmin
        ? DOCS_SUB_LINKS
        : DOCS_SUB_LINKS.filter(link => userPermissions[link.permission] === true);
    const showDocs = visibleDocsSubLinks.length > 0;
    const isDocsActive = DOCS_ACTIVE_KEYS.includes(activePage);

    // Generic dropdown link renderer
    const renderDropdownLink = (sub: { key: string; href: string; icon: string; label: string; divider?: boolean }, closeAll: () => void) => {
        const isTabLink = sub.href.includes('?tab=');
        const linkStyle: React.CSSProperties = {
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 14px', borderRadius: 10, textDecoration: 'none',
            color: 'var(--text-main)', fontWeight: 600,
            fontSize: '0.88rem', transition: 'all 0.15s',
            background: 'transparent', cursor: 'pointer',
        };
        const hoverIn = (e: React.MouseEvent) => { (e.currentTarget as HTMLElement).style.background = 'rgba(0,0,0,0.04)'; };
        const hoverOut = (e: React.MouseEvent) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; };

        return (
            <div key={sub.key}>
                {sub.divider && <div style={{ height: 1, background: 'var(--border)', margin: '4px 8px' }} />}
                {isTabLink ? (
                    <a href={sub.href} onClick={(e) => { e.preventDefault(); closeAll(); window.location.href = sub.href; }}
                        style={linkStyle} onMouseEnter={hoverIn} onMouseLeave={hoverOut}
                    >
                        <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--text-muted)' }}>{sub.icon}</span>
                        {sub.label}
                    </a>
                ) : (
                    <Link href={sub.href} onClick={closeAll} style={linkStyle} onMouseEnter={hoverIn} onMouseLeave={hoverOut}>
                        <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--text-muted)' }}>{sub.icon}</span>
                        {sub.label}
                    </Link>
                )}
            </div>
        );
    };

    const closeAllDropdowns = () => { setShowDashboardDropdown(false); setShowCrmDropdown(false); setShowFinanceiroDropdown(false); setShowPacotesDropdown(false); setShowAgendaDropdown(false); setShowDocsDropdown(false); setShowMobileNav(false); };

    // Global search items
    const allSearchItems = [
        ...TOP_NAV_LINKS.map(l => ({ label: l.label, href: l.href, icon: 'link', group: 'Páginas' })),
        ...DASHBOARD_SUB_LINKS.map(l => ({ label: l.label, href: l.href, icon: l.icon, group: 'Dashboard' })),
        ...FINANCEIRO_SUB_LINKS.map(l => ({ label: l.label, href: l.href, icon: l.icon, group: 'Financeiro' })),
        { label: 'Pagamentos', href: '/pagamentos', icon: 'payments', group: 'Páginas' },

        ...PACOTES_SUB_LINKS.map(l => ({ label: l.label, href: l.href, icon: l.icon, group: 'Vendas' })),
    ];
    const filteredSearch = searchQuery.trim()
        ? allSearchItems.filter(i => i.label.toLowerCase().includes(searchQuery.toLowerCase()))
        : allSearchItems;
    const searchGroups: Record<string, typeof allSearchItems> = {};
    filteredSearch.forEach(i => { if (!searchGroups[i.group]) searchGroups[i.group] = []; searchGroups[i.group].push(i); });

    // Keyboard shortcut Ctrl+K
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setShowSearch(true); setSearchQuery(''); }
            if (e.key === 'Escape') setShowSearch(false);
        };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, []);

    useEffect(() => { if (showSearch && searchInputRef.current) searchInputRef.current.focus(); }, [showSearch]);

    return (
        <>
        <header className="app-header">
            {/* Left: Logo + Hamburger + Nav */}
            <div className="app-header-left">
                <Link href="/dashboard" className="app-header-logo">
                    <img src="/logo-virtuosa.png" alt="Virtuosa" style={{ width: 36, height: 36, objectFit: 'contain' }} />
                    <span className="app-header-logo-text">Virtuosa</span>
                </Link>

                {/* Hamburger for mobile */}
                <button
                    className="app-hamburger"
                    onClick={() => setShowMobileNav(!showMobileNav)}
                    aria-label="Menu"
                >
                    <span className="material-symbols-outlined">{showMobileNav ? 'close' : 'menu'}</span>
                </button>

                <nav className={`app-header-nav ${showMobileNav ? 'open' : ''}`}>
                    {/* Dashboard dropdown */}
                    {showDashboard && (
                        <div ref={dashDropdownRef} style={{ position: 'relative' }}>
                            <button
                                className={`nav-link${isDashboardActive ? ' active' : ''}`}
                                onClick={(e) => { e.stopPropagation(); setShowDashboardDropdown(!showDashboardDropdown); setShowFinanceiroDropdown(false); }}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 2 }}
                            >
                                Dashboard
                                <span className="material-symbols-outlined" style={{ fontSize: 16, transition: 'transform 0.2s', transform: showDashboardDropdown ? 'rotate(180deg)' : 'none' }}>expand_more</span>
                            </button>
                            {showDashboardDropdown && (
                                <div style={{
                                    position: 'absolute', top: 'calc(100% + 6px)', left: 0,
                                    minWidth: 210, background: 'var(--card-bg)',
                                    backdropFilter: 'blur(20px)', border: '1px solid var(--border)',
                                    borderRadius: 14, boxShadow: '0 12px 32px rgba(0, 0, 0, 0.12)',
                                    padding: 6, zIndex: 1000, animation: 'fadeInScale 0.15s ease-out',
                                    maxHeight: 'calc(100vh - 80px)', overflowY: 'auto',
                                }}>
                                    {visibleDashSubLinks.map(sub => renderDropdownLink(sub, closeAllDropdowns))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Agenda dropdown */}
                    {showAgenda && (
                        <div ref={agendaDropdownRef} style={{ position: 'relative' }}>
                            <button
                                className={`nav-link${isAgendaActive ? ' active' : ''}`}
                                onClick={(e) => { e.stopPropagation(); setShowAgendaDropdown(!showAgendaDropdown); setShowDashboardDropdown(false); setShowCrmDropdown(false); setShowFinanceiroDropdown(false); setShowPacotesDropdown(false); }}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 2 }}
                            >
                                Agenda
                                <span className="material-symbols-outlined" style={{ fontSize: 16, transition: 'transform 0.2s', transform: showAgendaDropdown ? 'rotate(180deg)' : 'none' }}>expand_more</span>
                            </button>
                            {showAgendaDropdown && (
                                <div style={{
                                    position: 'absolute', top: 'calc(100% + 6px)', left: 0,
                                    minWidth: 210, background: 'var(--card-bg)',
                                    backdropFilter: 'blur(20px)', border: '1px solid var(--border)',
                                    borderRadius: 14, boxShadow: '0 12px 32px rgba(0, 0, 0, 0.12)',
                                    padding: 6, zIndex: 1000, animation: 'fadeInScale 0.15s ease-out',
                                }}>
                                    {visibleAgendaSubLinks.map(sub => renderDropdownLink(sub, closeAllDropdowns))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Vendas dropdown */}
                    {showPacotes && (
                        <div ref={pacDropdownRef} style={{ position: 'relative' }}>
                            <button
                                className={`nav-link${isPacotesActive ? ' active' : ''}`}
                                onClick={(e) => { e.stopPropagation(); setShowPacotesDropdown(!showPacotesDropdown); setShowDashboardDropdown(false); setShowCrmDropdown(false); setShowFinanceiroDropdown(false); }}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 2 }}
                            >
                                Vendas
                                <span className="material-symbols-outlined" style={{ fontSize: 16, transition: 'transform 0.2s', transform: showPacotesDropdown ? 'rotate(180deg)' : 'none' }}>expand_more</span>
                            </button>
                            {showPacotesDropdown && (
                                <div style={{
                                    position: 'absolute', top: 'calc(100% + 6px)', left: 0,
                                    minWidth: 210, background: 'var(--card-bg)',
                                    backdropFilter: 'blur(20px)', border: '1px solid var(--border)',
                                    borderRadius: 14, boxShadow: '0 12px 32px rgba(0, 0, 0, 0.12)',
                                    padding: 6, zIndex: 1000, animation: 'fadeInScale 0.15s ease-out',
                                }}>
                                    {visiblePacSubLinks.map(sub => renderDropdownLink(sub, closeAllDropdowns))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Remaining top links (excluding agenda) */}
                    {visibleTopLinks.filter(l => l.key !== 'agenda').map(link => (
                        <Link
                            key={link.key}
                            href={link.href}
                            className={`nav-link${activePage === link.key ? ' active' : ''}`}
                            style={{ textDecoration: 'none' }}
                            onClick={() => setShowMobileNav(false)}
                        >
                            {link.label}
                        </Link>
                    ))}

                    {/* CRM dropdown */}
                    {showCrm && (
                        <div ref={crmDropdownRef} style={{ position: 'relative' }}>
                            <button
                                className={`nav-link${isCrmActive ? ' active' : ''}`}
                                onClick={(e) => { e.stopPropagation(); setShowCrmDropdown(!showCrmDropdown); setShowDashboardDropdown(false); setShowFinanceiroDropdown(false); }}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 2 }}
                            >
                                CRM
                                <span className="material-symbols-outlined" style={{ fontSize: 16, transition: 'transform 0.2s', transform: showCrmDropdown ? 'rotate(180deg)' : 'none' }}>expand_more</span>
                            </button>
                            {showCrmDropdown && (
                                <div style={{
                                    position: 'absolute', top: 'calc(100% + 6px)', left: 0,
                                    minWidth: 200, background: 'var(--card-bg)',
                                    backdropFilter: 'blur(20px)', border: '1px solid var(--border)',
                                    borderRadius: 14, boxShadow: '0 12px 32px rgba(0, 0, 0, 0.12)',
                                    padding: 6, zIndex: 1000, animation: 'fadeInScale 0.15s ease-out',
                                }}>
                                    {visibleCrmSubLinks.map(sub => renderDropdownLink(sub, closeAllDropdowns))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Financeiro dropdown */}
                    {showFinanceiro && (
                        <div ref={finDropdownRef} style={{ position: 'relative' }}>
                            <button
                                className={`nav-link${isFinanceiroActive ? ' active' : ''}`}
                                onClick={(e) => { e.stopPropagation(); setShowFinanceiroDropdown(!showFinanceiroDropdown); setShowDashboardDropdown(false); }}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 2 }}
                            >
                                Financeiro
                                <span className="material-symbols-outlined" style={{ fontSize: 16, transition: 'transform 0.2s', transform: showFinanceiroDropdown ? 'rotate(180deg)' : 'none' }}>expand_more</span>
                            </button>
                            {showFinanceiroDropdown && (
                                <div style={{
                                    position: 'absolute', top: 'calc(100% + 6px)', left: 0,
                                    minWidth: 230, background: 'var(--card-bg)',
                                    backdropFilter: 'blur(20px)', border: '1px solid var(--border)',
                                    borderRadius: 14, boxShadow: '0 12px 32px rgba(0, 0, 0, 0.12)',
                                    padding: 6, zIndex: 1000, animation: 'fadeInScale 0.15s ease-out',
                                    maxHeight: 'calc(100vh - 80px)', overflowY: 'auto',
                                }}>
                                    {visibleFinSubLinks.map(sub => renderDropdownLink(sub, closeAllDropdowns))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Docs dropdown */}
                    {showDocs && (
                        <div ref={docsDropdownRef} style={{ position: 'relative' }}>
                            <button
                                className={`nav-link${isDocsActive ? ' active' : ''}`}
                                onClick={(e) => { e.stopPropagation(); setShowDocsDropdown(!showDocsDropdown); setShowDashboardDropdown(false); setShowFinanceiroDropdown(false); }}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 2 }}
                            >
                                Docs
                                <span className="material-symbols-outlined" style={{ fontSize: 16, transition: 'transform 0.2s', transform: showDocsDropdown ? 'rotate(180deg)' : 'none' }}>expand_more</span>
                            </button>
                            {showDocsDropdown && (
                                <div style={{
                                    position: 'absolute', top: 'calc(100% + 6px)', left: 0,
                                    minWidth: 230, background: 'var(--card-bg)',
                                    backdropFilter: 'blur(20px)', border: '1px solid var(--border)',
                                    borderRadius: 14, boxShadow: '0 12px 32px rgba(0, 0, 0, 0.12)',
                                    padding: 6, zIndex: 1000, animation: 'fadeInScale 0.15s ease-out',
                                    maxHeight: 'calc(100vh - 80px)', overflowY: 'auto',
                                }}>
                                    {visibleDocsSubLinks.map(sub => renderDropdownLink(sub, closeAllDropdowns))}
                                </div>
                            )}
                        </div>
                    )}

                </nav>
            </div>

            {/* Right: Unit Selector + Search + Notifications + Theme toggle + Profile */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {/* Global Unit Selector */}
                <div ref={unitDropdownRef} style={{ position: 'relative' }}>
                    {UNITS_LIST.length <= 1 ? (
                        /* Single unit — static label, no dropdown */
                        <div
                            title={`Unidade: ${globalUnit}`}
                            style={{
                                background: 'linear-gradient(135deg, var(--primary), #ff4db1)',
                                borderRadius: 10, padding: '6px 14px',
                                display: 'flex', alignItems: 'center', gap: 6,
                                color: '#fff', fontFamily: 'inherit', fontSize: '0.78rem',
                                fontWeight: 800, boxShadow: '0 2px 8px rgba(230,0,126,0.25)',
                            }}
                        >
                            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>location_on</span>
                            {globalUnit}
                        </div>
                    ) : (
                        /* Multiple units — interactive dropdown */
                        <>
                            <button
                                onClick={() => setShowUnitDropdown(!showUnitDropdown)}
                                title="Trocar Unidade"
                                style={{
                                    background: 'linear-gradient(135deg, var(--primary), #ff4db1)',
                                    border: 'none', borderRadius: 10, padding: '6px 14px',
                                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                                    color: '#fff', fontFamily: 'inherit', fontSize: '0.78rem',
                                    fontWeight: 800, transition: 'all 0.15s',
                                    boxShadow: '0 2px 8px rgba(230,0,126,0.25)',
                                }}
                            >
                                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>location_on</span>
                                {globalUnit}
                                <span className="material-symbols-outlined" style={{ fontSize: 14, transition: 'transform 0.2s', transform: showUnitDropdown ? 'rotate(180deg)' : 'none' }}>expand_more</span>
                            </button>
                            {showUnitDropdown && (
                                <div style={{
                                    position: 'absolute', top: 'calc(100% + 8px)', right: 0,
                                    minWidth: 180, background: 'var(--card-bg)',
                                    backdropFilter: 'blur(20px)', border: '1px solid var(--border)',
                                    borderRadius: 14, boxShadow: '0 12px 32px rgba(0,0,0,0.15)',
                                    padding: 6, zIndex: 1100, animation: 'fadeInScale 0.15s ease-out',
                                }}>
                                    <div style={{ padding: '6px 12px', fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                        Selecionar Unidade
                                    </div>
                                    {UNITS_LIST.map(u => (
                                        <button key={u} onClick={() => { setGlobalUnit(u); setShowUnitDropdown(false); }}
                                            style={{
                                                display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                                                padding: '10px 12px', border: 'none', borderRadius: 10,
                                                background: globalUnit === u ? 'linear-gradient(135deg, var(--primary), #ff4db1)' : 'transparent',
                                                color: globalUnit === u ? '#fff' : 'var(--text-main)',
                                                fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer',
                                                fontFamily: 'inherit', transition: 'all 0.12s',
                                            }}
                                            onMouseEnter={e => { if (globalUnit !== u) e.currentTarget.style.background = 'rgba(230,0,126,0.06)'; }}
                                            onMouseLeave={e => { if (globalUnit !== u) e.currentTarget.style.background = 'transparent'; }}
                                        >
                                            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>location_on</span>
                                            {u}
                                            {globalUnit === u && <span className="material-symbols-outlined" style={{ fontSize: 16, marginLeft: 'auto' }}>check</span>}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </>
                    )}
                </div>
                <button
                   
                    onClick={() => { setShowSearch(true); setSearchQuery(''); }}
                    title="Pesquisar (Ctrl+K)"
                    style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 10, padding: '6px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)', fontFamily: 'inherit', fontSize: '0.78rem', fontWeight: 600, transition: 'all 0.15s' }}
                >
                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>search</span>
                    <span className="app-search-label" style={{ opacity: 0.7 }}>Ctrl+K</span>
                </button>
                <span><NotificationBell /></span>
                <ThemeCustomizer />
                <button
                    className="theme-toggle"
                   
                    onClick={() => {
                        const next = !isDark;
                        setIsDark(next);
                        document.documentElement.setAttribute('data-theme', next ? 'dark' : 'light');
                        localStorage.setItem('virtuosa_theme', next ? 'dark' : 'light');
                    }}
                    title={isDark ? 'Modo claro' : 'Modo escuro'}
                >
                    <span className="material-symbols-outlined" style={{ fontSize: 20 }}>{isDark ? 'light_mode' : 'dark_mode'}</span>
                </button>
                <div ref={wrapperRef} className={`user-profile-wrapper ${showProfileDropdown ? 'active' : ''}`} style={{ position: 'relative' }}>
                    <div
                        className="profile-trigger"
                        onClick={() => setShowProfileDropdown(!showProfileDropdown)}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 10, padding: '6px 14px',
                            background: 'var(--card-bg)', border: '1px solid var(--border)',
                            borderRadius: 'var(--radius-full)', cursor: 'pointer',
                            transition: 'var(--transition)', userSelect: 'none'
                        }}
                    >
                        <div className="app-profile-avatar" style={{
                            width: 32, height: 32, background: 'linear-gradient(135deg, var(--primary), #ff4db1)',
                            color: 'white', borderRadius: '50%', display: 'flex', alignItems: 'center',
                            justifyContent: 'center', fontWeight: 800, fontSize: '0.82rem',
                            boxShadow: '0 2px 8px rgba(230, 0, 126, 0.2)'
                        }}>{initials}</div>
                        <div className="app-profile-info">
                            <div className="app-profile-name" style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-main)', lineHeight: 1.2 }}>{userName || 'Usuário'}</div>
                            <div className="app-profile-role" style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{formattedRole}{userRole !== 'ADMINISTRADOR' && userUnit ? ` - ${userUnit}` : ''}</div>
                        </div>
                        <span className="material-symbols-outlined chevron" style={{ fontSize: 18, color: 'var(--text-muted)', transition: 'transform 0.3s ease', transform: showProfileDropdown ? 'rotate(180deg)' : 'none' }}>expand_more</span>
                    </div>

                    {/* Dropdown Menu */}
                    {showProfileDropdown && (
                        <div className="profile-dropdown" style={{
                            position: 'absolute', top: 'calc(100% + 10px)', right: 0,
                            width: 260, background: 'rgba(255, 255, 255, 0.95)',
                            backdropFilter: 'blur(20px)', border: '1px solid rgba(255, 255, 255, 0.5)',
                            borderRadius: 20, boxShadow: '0 15px 35px rgba(0, 0, 0, 0.12)',
                            padding: 8, zIndex: 1000, animation: 'fadeInScale 0.2s ease-out'
                        }}>
                            <div className="dropdown-header" style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', marginBottom: 8 }}>
                                <div className="user-name" style={{ fontWeight: 800, color: 'var(--text-main)', fontSize: '0.95rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{userName}</div>
                                <div className="user-email" style={{ fontSize: '0.78rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 2 }}>{userEmail}</div>
                            </div>
                            {(isAdmin || userPermissions.perfil === true) && (
                                <Link href="/perfil" className="dropdown-item" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', color: 'var(--text-main)', fontSize: '0.9rem', fontWeight: 600, borderRadius: 12, cursor: 'pointer', textDecoration: 'none' }}>
                                    <span className="material-symbols-outlined icon">person</span> Meu Perfil
                                </Link>
                            )}
                            {(isAdmin || userPermissions.perfil === true) && (
                                <Link href="/perfil#change-password" className="dropdown-item" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', color: 'var(--text-main)', fontSize: '0.9rem', fontWeight: 600, borderRadius: 12, cursor: 'pointer', textDecoration: 'none' }}>
                                    <span className="material-symbols-outlined icon">lock</span> Alterar Senha
                                </Link>
                            )}
                            {isAdmin && (
                                <Link href="/usuarios" className="dropdown-item" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', color: 'var(--text-main)', fontSize: '0.9rem', fontWeight: 600, borderRadius: 12, cursor: 'pointer', textDecoration: 'none' }}>
                                    <span className="material-symbols-outlined icon">manage_accounts</span> Usuários
                                </Link>
                            )}
                            {isAdmin && (
                                <Link href="/configuracoes" className="dropdown-item" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', color: 'var(--text-main)', fontSize: '0.9rem', fontWeight: 600, borderRadius: 12, cursor: 'pointer', textDecoration: 'none' }}>
                                    <span className="material-symbols-outlined icon">settings</span> Configurações
                                </Link>
                            )}
                            <div
                                className="dropdown-item"
                                onClick={() => { setShowProfileDropdown(false); resetTour(); const tourMap: Record<string, string> = { dashboard: 'dashboard', agenda: 'agenda', pacotes: 'pacotes', 'pacotes-vendas': 'pacotes', 'pacotes-orcamento': 'pacotes-orcamento', 'pacotes-pacientes': 'pacotes-pacientes', clientes: 'clientes', financeiro: 'financeiro', estoque: 'estoque', contratos: 'contratos', cancelamentos: 'cancelamentos', usuarios: 'usuarios' }; const key = tourMap[activePage]; if (key) setTimeout(() => startTour(key), 400); }}
                                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', color: 'var(--primary)', fontSize: '0.9rem', fontWeight: 600, borderRadius: 12, cursor: 'pointer' }}
                            >
                                <span className="material-symbols-outlined icon">school</span> Refazer Tutorial
                            </div>
                            <div
                                className="dropdown-item logout"
                                onClick={() => { fetch('/api/auth/logout',{method:'POST'}).finally(()=>{ localStorage.removeItem('virtuosa_user'); window.location.href = '/login.html'; }); }}
                                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', color: 'var(--danger)', borderTop: '1px solid var(--border)', fontSize: '0.9rem', fontWeight: 600, borderRadius: '0 0 12px 12px', cursor: 'pointer', marginTop: 8 }}
                            >
                                <span className="material-symbols-outlined icon">logout</span> Sair
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </header>

        {/* Global Search Overlay */}
        {showSearch && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', zIndex: 9999, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 100 }} onClick={() => setShowSearch(false)}>
                <div onClick={e => e.stopPropagation()} style={{ background: 'var(--card-bg)', borderRadius: 20, border: '1px solid var(--border)', boxShadow: '0 24px 64px rgba(0,0,0,0.2)', width: '100%', maxWidth: 520, maxHeight: '70vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', animation: 'fadeInScale 0.15s ease-out' }}>
                    {/* Search input */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 22, color: 'var(--primary)' }}>search</span>
                        <input
                            ref={searchInputRef}
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            placeholder="Buscar funcionalidade..."
                            style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: '1rem', fontWeight: 600, color: 'var(--text-main)', fontFamily: 'inherit' }}
                        />
                        <kbd style={{ padding: '2px 8px', borderRadius: 6, background: 'var(--bg)', border: '1px solid var(--border)', fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', fontFamily: 'inherit' }}>ESC</kbd>
                    </div>
                    {/* Results */}
                    <div style={{ overflowY: 'auto', padding: 8, flex: 1 }}>
                        {Object.entries(searchGroups).length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)' }}>
                                <span className="material-symbols-outlined" style={{ fontSize: 32, opacity: 0.3 }}>search_off</span>
                                <p style={{ marginTop: 8, fontSize: '0.85rem' }}>Nenhum resultado para &quot;{searchQuery}&quot;</p>
                            </div>
                        ) : (
                            Object.entries(searchGroups).map(([group, items]) => (
                                <div key={group} style={{ marginBottom: 8 }}>
                                    <div style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', padding: '6px 12px' }}>{group}</div>
                                    {items.map(item => (
                                        <a
                                            key={item.href + item.label}
                                            href={item.href}
                                            onClick={(e) => { e.preventDefault(); setShowSearch(false); window.location.href = item.href; }}
                                            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, textDecoration: 'none', color: 'var(--text-main)', fontWeight: 600, fontSize: '0.88rem', transition: 'all 0.12s', cursor: 'pointer' }}
                                            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(230,0,126,0.06)'; }}
                                            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                                        >
                                            <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--text-muted)' }}>{item.icon}</span>
                                            {item.label}
                                            <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'var(--text-muted)', marginLeft: 'auto', opacity: 0.4 }}>arrow_forward</span>
                                        </a>
                                    ))}
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        )}
        </>
    );
}
