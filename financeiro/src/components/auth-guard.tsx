'use client';

import { useEffect, useState } from 'react';

interface AuthGuardProps {
    children: React.ReactNode;
    allowedRoles?: string[];
    requiredPermission?: string; // e.g: 'admin', 'pedidos', 'financeiro', 'cancelamento', 'dashboard'
}

// Map permission keys to their page routes
const PERMISSION_ROUTES: Record<string, string> = {
    cancelamento: '/cancelamentos',
    pedidos: '/pedidos',
    insumos: '/insumos',
    dashboard: '/dashboard',
    financeiro: '/',
    perfil: '/perfil',
};

export default function AuthGuard({ children, allowedRoles, requiredPermission }: AuthGuardProps) {
    const [isAuthorized, setIsAuthorized] = useState(false);

    useEffect(() => {
        let userDataRaw = localStorage.getItem('virtuosa_user');

        if (!userDataRaw) {
            window.location.href = '/login.html';
            return;
        }

        try {
            const user = JSON.parse(userDataRaw);
            const role = user.role || 'VENDEDOR';
            const permissions = user.permissions || {};
            const isAdmin = permissions.admin === true || role === 'ADMINISTRADOR';

            // Role-based check
            if (allowedRoles && !allowedRoles.includes(role)) {
                const fallback = findFirstPermittedRoute(permissions, isAdmin);
                window.location.href = fallback;
                return;
            }

            // Permission-based check (skip for 'perfil' — always accessible as fallback)
            if (requiredPermission && requiredPermission !== 'perfil' && !isAdmin) {
                if (permissions[requiredPermission] !== true) {
                    const fallback = findFirstPermittedRoute(permissions, isAdmin);
                    window.location.href = fallback;
                    return;
                }
            }

            // Populate header with user details if possible
            const nameEls = document.querySelectorAll('.profile-name, .user-name');
            const roleEls = document.querySelectorAll('.profile-role');
            const avatarEls = document.querySelectorAll('.profile-avatar');

            const formatRole = (r: string) => r.charAt(0) + r.slice(1).toLowerCase();
            const displayRole = user.unit ? `${formatRole(role)} - ${user.unit}` : formatRole(role);
            const initials = user.name ? user.name.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase() : 'U';

            if (nameEls) nameEls.forEach(el => el.textContent = user.name);
            if (roleEls) roleEls.forEach(el => el.textContent = displayRole);
            if (avatarEls) avatarEls.forEach(el => el.textContent = initials);

            setIsAuthorized(true);
        } catch (e) {
            console.error('Invalid user data', e);
            localStorage.removeItem('virtuosa_user');
            window.location.href = '/login.html';
        }
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
    return '/perfil'; // Last resort
}
