'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { NotificationBell } from '@/components/notification-bell';

type ActivePage = 'dashboard' | 'agenda' | 'cancelamentos' | 'pedidos' | 'insumos' | 'financeiro' | 'perfil' | 'usuarios' | 'chat' | 'termos' | 'clientes' | 'estoque';

interface AppHeaderProps {
    activePage?: ActivePage;
}

// Top-level nav links (flat, no dropdown)
const TOP_NAV_LINKS: { key: ActivePage; label: string; href: string; permission: string }[] = [
    { key: 'agenda', label: 'Agenda', href: '/agenda', permission: 'dashboard' },
    { key: 'pedidos', label: 'Pedidos', href: '/pedidos', permission: 'pedidos' },
    { key: 'clientes', label: 'Clientes', href: '/clientes', permission: 'dashboard' },
    { key: 'estoque', label: 'Estoque', href: '/estoque', permission: 'dashboard' },
];

// Dashboard dropdown sub-items
const DASHBOARD_SUB_LINKS: { key: string; label: string; href: string; icon: string; permission: string; divider?: boolean }[] = [
    { key: 'dash-overview', label: 'Visão Geral', href: '/dashboard?tab=dashboard', icon: 'dashboard', permission: 'dashboard' },
    { key: 'dash-sales', label: 'Vendas', href: '/dashboard?tab=sales', icon: 'point_of_sale', permission: 'dashboard' },
    { key: 'dash-goals', label: 'Metas', href: '/dashboard?tab=goals', icon: 'flag', permission: 'dashboard' },
    { key: 'dash-reports', label: 'Relatórios', href: '/dashboard?tab=reports', icon: 'summarize', permission: 'dashboard' },
    { key: 'dash-analytics', label: 'Análise', href: '/dashboard?tab=analytics', icon: 'analytics', permission: 'dashboard' },
    { key: 'dash-commissions', label: 'Comissões', href: '/dashboard?tab=commissions', icon: 'payments', permission: 'dashboard', divider: true },
    { key: 'dash-units', label: 'Comparativo', href: '/dashboard?tab=units', icon: 'leaderboard', permission: 'dashboard' },
    { key: 'dash-activity', label: 'Atividades', href: '/dashboard?tab=activity', icon: 'history', permission: 'dashboard' },
    { key: 'dash-backup', label: 'Backup', href: '/dashboard?tab=backup', icon: 'backup', permission: 'dashboard' },
    { key: 'dash-retention', label: 'Retenção', href: '/dashboard?tab=retention', icon: 'loyalty', permission: 'dashboard' },
    { key: 'dash-forecast', label: 'Fluxo de Caixa', href: '/dashboard?tab=forecast', icon: 'show_chart', permission: 'dashboard' },
    { key: 'dash-professionals', label: 'Profissionais', href: '/dashboard?tab=professionals', icon: 'badge', permission: 'dashboard' },
];

// Financeiro dropdown sub-items
const FINANCEIRO_SUB_LINKS: { key: string; label: string; href: string; icon: string; permission: string; divider?: boolean }[] = [
    { key: 'fin-folha', label: 'Folha de Pagamento', href: '/?tab=folha', icon: 'payments', permission: 'financeiro' },
    { key: 'fin-adiantamento', label: 'Adiantamento', href: '/?tab=adiantamento', icon: 'account_balance_wallet', permission: 'financeiro' },
    { key: 'fin-premiacao', label: 'Premiação', href: '/?tab=premiacao', icon: 'emoji_events', permission: 'financeiro' },
    { key: 'fin-reembolso', label: 'Reembolso', href: '/?tab=reembolso', icon: 'receipt_long', permission: 'financeiro' },
    { key: 'fin-custos', label: 'Custos', href: '/?tab=custos', icon: 'account_balance', permission: 'financeiro' },
    { key: 'fin-analise', label: 'Análise', href: '/?tab=analise', icon: 'analytics', permission: 'financeiro' },
    { key: 'cancelamentos', label: 'Cancelamentos', href: '/cancelamentos', icon: 'cancel', permission: 'cancelamento', divider: true },
    { key: 'termos', label: 'Termos e Contratos', href: '/termos', icon: 'description', permission: 'dashboard' },
];

const FINANCEIRO_ACTIVE_KEYS: ActivePage[] = ['financeiro', 'cancelamentos', 'termos'];

export function AppHeader({ activePage = 'dashboard' }: AppHeaderProps) {
    const [showProfileDropdown, setShowProfileDropdown] = useState(false);
    const [showDashboardDropdown, setShowDashboardDropdown] = useState(false);
    const [showFinanceiroDropdown, setShowFinanceiroDropdown] = useState(false);
    const [showMobileNav, setShowMobileNav] = useState(false);
    const [isAdmin, setIsAdmin] = useState(false);
    const [userName, setUserName] = useState('');
    const [userEmail, setUserEmail] = useState('');
    const [userRole, setUserRole] = useState('');
    const [userUnit, setUserUnit] = useState('');
    const [userPermissions, setUserPermissions] = useState<Record<string, boolean>>({});
    const [isDark, setIsDark] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const dashDropdownRef = useRef<HTMLDivElement>(null);
    const finDropdownRef = useRef<HTMLDivElement>(null);

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
            if (finDropdownRef.current && !finDropdownRef.current.contains(e.target as Node)) {
                setShowFinanceiroDropdown(false);
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
            termos: 'Termos e Contratos',
            clientes: 'CRM de Clientes',
            estoque: 'Estoque',
        };
        document.title = titles[activePage] || 'Virtuosa';
    }, [activePage]);

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

    const closeAllDropdowns = () => { setShowDashboardDropdown(false); setShowFinanceiroDropdown(false); setShowMobileNav(false); };

    return (
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
                                }}>
                                    {visibleDashSubLinks.map(sub => renderDropdownLink(sub, closeAllDropdowns))}
                                </div>
                            )}
                        </div>
                    )}

                    {visibleTopLinks.map(link => (
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
                                }}>
                                    {visibleFinSubLinks.map(sub => renderDropdownLink(sub, closeAllDropdowns))}
                                </div>
                            )}
                        </div>
                    )}

                </nav>
            </div>

            {/* Right: Notifications + Theme toggle + Profile */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <NotificationBell />
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
    );
}
