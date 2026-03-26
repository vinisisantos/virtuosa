'use client';

import { useState, useEffect } from 'react';

const UNITS = ['Barueri', 'Osasco', 'SBC', 'SCS'];

interface UnitSelectorProps {
    selectedUnit: string;
    onUnitChange: (unit: string) => void;
}

/**
 * Shared unit selector component.
 * Admin users see all units + "Todas". Non-admin users see only their assigned unit (read-only).
 */
export function UnitSelector({ selectedUnit, onUnitChange }: UnitSelectorProps) {
    const [isAdmin, setIsAdmin] = useState(false);
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        try {
            const raw = localStorage.getItem('virtuosa_user');
            if (raw) {
                const user = JSON.parse(raw);
                const perms = user.permissions || {};
                setIsAdmin(perms.admin === true || user.role === 'ADMINISTRADOR');
            }
        } catch {}
        setLoaded(true);
    }, []);

    if (!loaded) return null;

    // Non-admin: show locked unit badge
    if (!isAdmin) {
        return (
            <div style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
                <div style={{
                    padding: '8px 16px', borderRadius: 10,
                    background: 'var(--primary)', color: '#fff',
                    fontWeight: 700, fontSize: '0.82rem', fontFamily: 'inherit',
                }}>
                    {selectedUnit}
                </div>
            </div>
        );
    }

    // Admin: buttons for all units
    return (
        <div style={{ display: 'flex', gap: 4, marginBottom: 20, flexWrap: 'wrap' }}>
            <button
                onClick={() => onUnitChange('all')}
                style={{
                    padding: '8px 16px', borderRadius: 10, border: 'none',
                    background: selectedUnit === 'all' ? 'var(--primary)' : 'var(--card-bg)',
                    color: selectedUnit === 'all' ? '#fff' : 'var(--text-muted)',
                    fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer', fontFamily: 'inherit',
                }}
            >
                Todas
            </button>
            {UNITS.map(u => (
                <button
                    key={u}
                    onClick={() => onUnitChange(u)}
                    style={{
                        padding: '8px 16px', borderRadius: 10, border: 'none',
                        background: selectedUnit === u ? 'var(--primary)' : 'var(--card-bg)',
                        color: selectedUnit === u ? '#fff' : 'var(--text-muted)',
                        fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer', fontFamily: 'inherit',
                    }}
                >
                    {u.length > 15 ? u.split(' ')[1] || u : u}
                </button>
            ))}
        </div>
    );
}

/** Get the current user's unit from localStorage */
export function getUserUnit(): string {
    try {
        const raw = localStorage.getItem('virtuosa_user');
        if (raw) {
            const user = JSON.parse(raw);
            return user.unit || 'Barueri';
        }
    } catch {}
    return 'Barueri';
}

/** Check if user is admin */
export function isUserAdmin(): boolean {
    try {
        const raw = localStorage.getItem('virtuosa_user');
        if (raw) {
            const user = JSON.parse(raw);
            const perms = user.permissions || {};
            return perms.admin === true || user.role === 'ADMINISTRADOR';
        }
    } catch {}
    return false;
}
