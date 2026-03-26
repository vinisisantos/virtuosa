'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';

type ActivePage = 'dashboard' | 'agenda' | 'cancelamentos' | 'pedidos' | 'insumos' | 'financeiro' | 'perfil' | 'usuarios' | 'chat' | 'termos';

interface AppHeaderProps {
    activePage: ActivePage;
}

// Map nav links to their permission keys
const ALL_NAV_LINKS: { key: ActivePage; label: string; href: string; permission: string }[] = [
    { key: 'dashboard', label: 'Dashboard', href: '/dashboard', permission: 'dashboard' },
    { key: 'agenda', label: 'Agenda', href: '/agenda', permission: 'dashboard' },
    { key: 'cancelamentos', label: 'Cancelamentos', href: '/cancelamentos', permission: 'cancelamento' },
    { key: 'pedidos', label: 'Pedidos', href: '/pedidos', permission: 'pedidos' },
    { key: 'insumos', label: 'Insumos', href: '/insumos', permission: 'pedidos' },
    { key: 'financeiro', label: 'Financeiro', href: '/', permission: 'financeiro' },
    { key: 'termos', label: 'Termos', href: '/termos', permission: 'dashboard' },
    { key: 'chat', label: 'Chat IA', href: '/chat', permission: 'dashboard' },
];

export function AppHeader({ activePage }: AppHeaderProps) {
    const [showProfileDropdown, setShowProfileDropdown] = useState(false);
    const [showMobileNav, setShowMobileNav] = useState(false);
    const [isAdmin, setIsAdmin] = useState(false);
    const [userName, setUserName] = useState('');
    const [userEmail, setUserEmail] = useState('');
    const [userRole, setUserRole] = useState('');
    const [userUnit, setUserUnit] = useState('');
    const [userPermissions, setUserPermissions] = useState<Record<string, boolean>>({});
    const [isDark, setIsDark] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);

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

    // Click outside to close dropdown
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
                setShowProfileDropdown(false);
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

    // Filter nav links based on permissions (admin sees all)
    const navLinks = isAdmin
        ? ALL_NAV_LINKS
        : ALL_NAV_LINKS.filter(link => userPermissions[link.permission] === true);

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
                    {navLinks.map(link => (
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
