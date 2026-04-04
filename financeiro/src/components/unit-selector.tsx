'use client';

import { useGlobalUnit } from '@/contexts/UnitContext';

interface UnitSelectorProps {
    selectedUnit: string;
    onUnitChange: (unit: string) => void;
}

/**
 * Shared unit selector component.
 * Shows only the units the user has access to.
 * If user has a single unit, shows a read-only badge.
 * If user has multiple units, shows clickable buttons for each allowed unit.
 */
export function UnitSelector({ selectedUnit, onUnitChange }: UnitSelectorProps) {
    const { units } = useGlobalUnit();

    // Single unit: show locked badge
    if (units.length <= 1) {
        return (
            <div style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
                <div style={{
                    padding: '8px 16px', borderRadius: 10,
                    background: 'var(--primary)', color: '#fff',
                    fontWeight: 700, fontSize: '0.82rem', fontFamily: 'inherit',
                }}>
                    {units[0] || selectedUnit}
                </div>
            </div>
        );
    }

    // Multiple units: show buttons for each allowed unit (no "Todas" option)
    return (
        <div style={{ display: 'flex', gap: 4, marginBottom: 20, flexWrap: 'wrap' }}>
            {units.map(u => (
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
