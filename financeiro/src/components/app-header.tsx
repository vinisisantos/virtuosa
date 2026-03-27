'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';

type ActivePage = 'dashboard' | 'agenda' | 'cancelamentos' | 'pedidos' | 'insumos' | 'financeiro' | 'perfil' | 'usuarios' | 'chat' | 'termos';

interface AppHeaderProps {
    activePage: ActivePage;
}

// Top-level nav links (flat, no dropdown)
const TOP_NAV_LINKS: { key: ActivePage; label: string; href: string; permission: string }[] = [
    { key: 'dashboard', label: 'Dashboard', href: '/dashboard', permission: 'dashboard' },
    { key: 'agenda', label: 'Agenda', href: '/agenda', permission: 'dashboard' },
    { key: 'pedidos', label: 'Pedidos', href: '/pedidos', permission: 'pedidos' },
];

// Financeiro dropdown sub-items
const FINANCEIRO_SUB_LINKS: { key: ActivePage; label: string; href: string; icon: string; permission: string }[] = [
    { key: 'financeiro', label: 'Painel Financeiro', href: '/', icon: 'payments', permission: 'financeiro' },
    { key: 'cancelamentos', label: 'Cancelamentos', href: '/cancelamentos', icon: 'cancel', permission: 'cancelamento' },
    { key: 'termos', label: 'Termos e Contratos', href: '/termos', icon: 'description', permission: 'dashboard' },
];

const FINANCEIRO_ACTIVE_KEYS: ActivePage[] = ['financeiro', 'cancelamentos', 'termos'];

export function AppHeader({ activePage }: AppHeaderProps) {
    const [showProfileDropdown, setShowProfileDropdown] = useState(false);
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

    // Filter financeiro sub-links
    const visibleFinSubLinks = isAdmin
        ? FINANCEIRO_SUB_LINKS
        : FINANCEIRO_SUB_LINKS.filter(link => userPermissions[link.permission] === true);

    const showFinanceiro = visibleFinSubLinks.length > 0;
    const isFinanceiroActive = FINANCEIRO_ACTIVE_KEYS.includes(activePage);

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
                                onClick={(e) => { e.stopPropagation(); setShowFinanceiroDropdown(!showFinanceiroDropdown); }}
                                style={{
                                    background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                                    display: 'flex', alignItems: 'center', gap: 4, padding: '8px 16px',
                                    fontSize: 'inherit', fontWeight: 'inherit', color: 'inherit',
                                }}
                            >
                                Financeiro
                                <span className="material-symbols-outlined" style={{
                                    fontSize: 16, transition: 'transform 0.2s',
                                    transform: showFinanceiroDropdown ? 'rotate(180deg)' : 'none',
                                }}>expand_more</span>
                            </button>

                            {showFinanceiroDropdown && (
                                <div style={{
                                    position: 'absolute', top: 'calc(100% + 6px)', left: 0,
                                    minWidth: 220, background: 'var(--card-bg)',
                                    backdropFilter: 'blur(20px)', border: '1px solid var(--border)',
                                    borderRadius: 14, boxShadow: '0 12px 32px rgba(0, 0, 0, 0.12)',
                                    padding: 6, zIndex: 1000, animation: 'fadeInScale 0.15s ease-out',
                                }}>
                                    {visibleFinSubLinks.map(sub => (
                                        <Link
                                            key={sub.key}
                                            href={sub.href}
                                            onClick={() => { setShowFinanceiroDropdown(false); setShowMobileNav(false); }}
                                            style={{
                                                display: 'flex', alignItems: 'center', gap: 10,
                                                padding: '10px 14px', borderRadius: 10, textDecoration: 'none',
                                                color: activePage === sub.key ? 'var(--primary)' : 'var(--text-main)',
                                                fontWeight: activePage === sub.key ? 800 : 600,
                                                fontSize: '0.88rem', transition: 'all 0.15s',
                                                background: activePage === sub.key ? 'rgba(230, 0, 126, 0.06)' : 'transparent',
                                            }}
                                            onMouseEnter={e => { if (activePage !== sub.key) e.currentTarget.style.background = 'rgba(0,0,0,0.04)'; }}
                                            onMouseLeave={e => { if (activePage !== sub.key) e.currentTarget.style.background = 'transparent'; }}
                                        >
                                            <span className="material-symbols-outlined" style={{ fontSize: 20, color: activePage === sub.key ? 'var(--primary)' : 'var(--text-muted)' }}>{sub.icon}</span>
                                            {sub.label}
                                        </Link>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Chat IA link */}
                    {(isAdmin || userPermissions.dashboard === true) && (
                        <Link
                            href="/chat"
                            className={`nav-link${activePage === 'chat' ? ' active' : ''}`}
                            style={{ textDecoration: 'none' }}
                            onClick={() => setShowMobileNav(false)}
                        >
                            Chat IA
                        </Link>
                    )}
                </nav>
            </div>

            {/* Right: Theme toggle + Profile */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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
