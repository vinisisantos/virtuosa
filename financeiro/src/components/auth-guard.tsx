'use client';

import { useEffect, useState } from 'react';

interface AuthGuardProps {
    children: React.ReactNode;
    allowedRoles?: string[];
    requiredPermission?: string;
    alternativePermissions?: string[];
}

const PERMISSION_ROUTES: Record<string, string> = {
    cancelamento: '/cancelamentos',
    pedidos: '/pedidos',
    insumos: '/insumos',
    dashboard: '/dashboard',
    financeiro: '/',
    finReembolso: '/?tab=reembolso',
    finAdiantamento: '/?tab=adiantamento',
    finPremiacao: '/?tab=premiacao',
    finCustos: '/?tab=custos',
    finAnalise: '/?tab=analise',
    perfil: '/perfil',
};

export default function AuthGuard({ children, allowedRoles, requiredPermission, alternativePermissions }: AuthGuardProps) {
    const [isAuthorized, setIsAuthorized] = useState(false);

    useEffect(() => {
        // Validate session against the server — never trust localStorage alone
        fetch('/api/auth/me', { credentials: 'include' })
            .then(r => r.json())
            .then(data => {
                if (!data.authenticated || !data.user) {
                    localStorage.removeItem('virtuosa_user');
                    window.location.href = '/login.html';
                    return;
                }

                const user = data.user;
                const role = user.role || 'VENDEDOR';
                const permissions = user.permissions || {};
                const isAdmin = role === 'ADMINISTRADOR';

                // Keep localStorage in sync with server-verified data
                localStorage.setItem('virtuosa_user', JSON.stringify(user));

                // Role-based check
                if (allowedRoles && !allowedRoles.includes(role)) {
                    window.location.href = findFirstPermittedRoute(permissions, isAdmin);
                    return;
                }

                // Permission-based check (skip for 'perfil')
                if (requiredPermission && requiredPermission !== 'perfil' && !isAdmin) {
                    const hasMain = permissions[requiredPermission] === true;
                    const hasAlt = alternativePermissions?.some(p => permissions[p] === true) || false;
                    if (!hasMain && !hasAlt) {
                        window.location.href = findFirstPermittedRoute(permissions, isAdmin);
                        return;
                    }
                }

                // Populate header display elements
                const nameEls = document.querySelectorAll('.profile-name, .user-name');
                const roleEls = document.querySelectorAll('.profile-role');
                const avatarEls = document.querySelectorAll('.profile-avatar');

                const formatRole = (r: string) => r.charAt(0) + r.slice(1).toLowerCase();
                const displayRole = user.unit ? `${formatRole(role)} - ${user.unit}` : formatRole(role);
                const initials = user.name
                    ? user.name.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase()
                    : 'U';

                nameEls.forEach(el => el.textContent = user.name);
                roleEls.forEach(el => el.textContent = displayRole);
                avatarEls.forEach(el => el.textContent = initials);

                setIsAuthorized(true);
            })
            .catch(() => {
                localStorage.removeItem('virtuosa_user');
                window.location.href = '/login.html';
            });
    }, [allowedRoles, requiredPermission]);

    if (!isAuthorized) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: 'var(--bg)' }}>
                <div style={{ textAlign: 'center' }}>
                    <span className="material-symbols-outlined spinning" style={{ fontSize: '3rem', color: 'var(--primary)', marginBottom: '16px' }}>progress_activity</span>
                    <h2 style={{ color: 'var(--text-main)' }}>Verificando acessos...</h2>
                </div>
            </div>
        );
    }

    return <>{children}</>;
}

function findFirstPermittedRoute(permissions: Record<string, boolean>, isAdmin: boolean): string {
    if (isAdmin) return '/dashboard';
    for (const [key, route] of Object.entries(PERMISSION_ROUTES)) {
        if (permissions[key] === true) return route;
    }
    return '/perfil';
}
