'use client';

import { useState } from 'react';
import { AdiantamentoSection } from './adiantamento-section';

interface AdiantamentoToggleProps {
    selectedUnit: string;
}

export function AdiantamentoToggle({ selectedUnit }: AdiantamentoToggleProps) {
    const [showAdiant, setShowAdiant] = useState(() => {
        if (typeof window !== 'undefined') {
            return localStorage.getItem('virtuosa_show_adiant') !== 'false';
        }
        return true;
    });

    const toggleAdiant = () => {
        const next = !showAdiant;
        setShowAdiant(next);
        localStorage.setItem('virtuosa_show_adiant', String(next));
    };

    return (
        <div style={{ margin: '24px 0' }}>
            <div
                onClick={toggleAdiant}
                style={{
                    display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer',
                    userSelect: 'none', padding: '12px 16px', borderRadius: 'var(--radius-md)',
                    background: 'var(--card-bg)', border: '1px solid var(--border)',
                    boxShadow: 'var(--shadow-sm)', transition: 'all 0.2s',
                }}
            >
                <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#f59e0b' }}>account_balance_wallet</span>
                <span style={{ flex: 1, fontSize: '0.88rem', fontWeight: 800, color: 'var(--text-main)' }}>Adiantamentos</span>
                {/* Toggle switch */}
                <div onClick={e => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: '0.72rem', fontWeight: 700, color: showAdiant ? '#f59e0b' : 'var(--text-muted)' }}>
                        {showAdiant ? 'Ativado' : 'Desativado'}
                    </span>
                    <div
                        onClick={toggleAdiant}
                        style={{
                            width: 40, height: 22, borderRadius: 11, cursor: 'pointer',
                            background: showAdiant ? '#f59e0b' : 'var(--border)',
                            position: 'relative' as const, transition: 'background 0.3s',
                        }}
                    >
                        <div style={{
                            width: 16, height: 16, borderRadius: 8, background: '#fff',
                            position: 'absolute' as const, top: 3,
                            left: showAdiant ? 21 : 3,
                            transition: 'left 0.3s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                        }} />
                    </div>
                </div>
                <span className="material-symbols-outlined" style={{
                    fontSize: 20, color: 'var(--text-muted)',
                    transition: 'transform 0.3s',
                    transform: showAdiant ? 'rotate(180deg)' : 'rotate(0deg)',
                }}>expand_more</span>
            </div>
            <div style={{
                maxHeight: showAdiant ? 2000 : 0,
                opacity: showAdiant ? 1 : 0,
                overflow: 'hidden',
                transition: 'max-height 0.4s ease, opacity 0.3s ease',
                marginTop: showAdiant ? 12 : 0,
            }}>
                <AdiantamentoSection selectedUnit={selectedUnit} />
            </div>
        </div>
    );
}
