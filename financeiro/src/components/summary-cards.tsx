'use client';

import { useState, useEffect } from 'react';
import type { PayrollSummary } from '@/lib/types';

interface SummaryCardsProps {
    summary: PayrollSummary;
    competenceMonth?: number;
    competenceYear?: number;
    selectedUnit?: string;
}

function formatBRL(value: number): string {
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

const UNITS = ['Barueri', 'Osasco', 'SBC', 'SCS'];

const cardStyles = {
    base: {
        background: 'var(--card-bg)',
        padding: 24,
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-md)',
        border: '1px solid var(--border)',
        transition: 'var(--transition)',
        position: 'relative' as const,
        overflow: 'hidden' as const,
        cursor: 'default',
    },
    accent: (color: string) => ({
        content: '',
        position: 'absolute' as const,
        top: 0, left: 0,
        width: 4, height: '100%',
        background: color,
    }),
};

export function SummaryCards({ summary, competenceMonth, competenceYear, selectedUnit }: SummaryCardsProps) {
    const [unitSummaries, setUnitSummaries] = useState<Record<string, PayrollSummary>>({});

    // Fetch per-unit summaries when viewing 'all'
    useEffect(() => {
        if (selectedUnit !== 'all' || !competenceMonth || !competenceYear) return;
        const fetchAll = async () => {
            const results: Record<string, PayrollSummary> = {};
            await Promise.all(UNITS.map(async unit => {
                try {
                    const res = await fetch(`/api/payroll/entries?month=${competenceMonth}&year=${competenceYear}&unit=${encodeURIComponent(unit)}`);
                    const data = await res.json();
                    if (data.summary) results[unit] = data.summary;
                } catch {}
            }));
            setUnitSummaries(results);
        };
        fetchAll();
    }, [selectedUnit, competenceMonth, competenceYear]);

    const cards = [
        {
            label: 'Total da Folha',
            value: formatBRL(summary.totalPayroll),
            sub: `${summary.totalEmployees} colaboradores`,
            icon: 'payments',
            accentColor: 'var(--primary)',
            iconBg: 'var(--primary-light)',
            iconColor: 'var(--primary)',
        },
        {
            label: 'Total Pago',
            value: formatBRL(summary.totalPaid),
            sub: `${summary.paidCount} pagos`,
            icon: 'check_circle',
            accentColor: 'var(--success)',
            iconBg: 'var(--success-light)',
            iconColor: 'var(--success)',
        },
        {
            label: 'Total Pendente',
            value: formatBRL(summary.totalPending),
            sub: `${summary.pendingCount} pendentes`,
            icon: 'schedule',
            accentColor: 'var(--warning)',
            iconBg: 'var(--warning-light)',
            iconColor: 'var(--warning)',
        },
        {
            label: 'Em Revisão',
            value: summary.reviewCount.toString(),
            sub: 'itens para revisar',
            icon: 'rate_review',
            accentColor: 'var(--danger)',
            iconBg: 'var(--danger-light)',
            iconColor: 'var(--danger)',
        },
    ];

    const paidPercentage = summary.totalPayroll > 0
        ? (summary.totalPaid / summary.totalPayroll) * 100 : 0;

    return (
        <div>
            {/* Stats Grid */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                gap: 24,
                marginBottom: 24,
            }}>
                {cards.map((card) => (
                    <div key={card.label} style={cardStyles.base}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-4px)'; (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-lg)'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = ''; (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-md)'; }}
                    >
                        <div style={cardStyles.accent(card.accentColor)} />
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                {card.label}
                            </span>
                            <div style={{
                                width: 44, height: 44, borderRadius: 12,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                background: card.iconBg, color: card.iconColor,
                            }}>
                                <span className="material-symbols-outlined">{card.icon}</span>
                            </div>
                        </div>
                        <span style={{ fontSize: '2rem', fontWeight: 800, letterSpacing: '-0.5px', display: 'block' }}>
                            {card.value}
                        </span>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                            {card.sub}
                        </span>
                    </div>
                ))}
            </div>

            {/* Per-unit breakdown (only when 'all' is selected) */}
            {selectedUnit === 'all' && Object.keys(unitSummaries).length > 0 && (
                <div style={{
                    background: 'var(--card-bg)', borderRadius: 'var(--radius-lg)',
                    padding: 20, border: '1px solid var(--border)',
                    boxShadow: 'var(--shadow-md)', marginBottom: 24,
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--primary)' }}>apartment</span>
                        <span style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-main)' }}>Resumo por Unidade</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                        {UNITS.map(unit => {
                            const us = unitSummaries[unit];
                            if (!us || us.totalEmployees === 0) return null;
                            const perc = us.totalPayroll > 0 ? Math.round((us.totalPaid / us.totalPayroll) * 100) : 0;
                            return (
                                <div key={unit} style={{
                                    padding: 16, borderRadius: 'var(--radius-md)',
                                    border: '1px solid var(--border)', background: 'var(--bg)',
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                        <span style={{ fontWeight: 800, fontSize: '0.9rem', color: 'var(--text-main)' }}>{unit}</span>
                                        <span style={{
                                            fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px', borderRadius: 6,
                                            background: perc === 100 ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)',
                                            color: perc === 100 ? '#10b981' : '#f59e0b',
                                        }}>
                                            {perc}%
                                        </span>
                                    </div>
                                    <div style={{ fontSize: '1.15rem', fontWeight: 900, color: 'var(--primary)', marginBottom: 4 }}>
                                        {formatBRL(us.totalPayroll)}
                                    </div>
                                    <div style={{ display: 'flex', gap: 8, fontSize: '0.72rem', fontWeight: 600 }}>
                                        <span style={{ color: 'var(--success)' }}>✓ {us.paidCount}</span>
                                        <span style={{ color: 'var(--text-muted)' }}>⏳ {us.pendingCount}</span>
                                        <span style={{ color: 'var(--text-muted)' }}>{us.totalEmployees} col.</span>
                                    </div>
                                    <div style={{ width: '100%', height: 4, borderRadius: 4, background: 'var(--border)', marginTop: 8, overflow: 'hidden' }}>
                                        <div style={{ width: `${perc}%`, height: '100%', borderRadius: 4, background: perc === 100 ? 'var(--success)' : 'var(--primary)', transition: 'width 0.4s' }} />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Progress bar */}
            {summary.totalPayroll > 0 && (
                <div style={{
                    background: 'var(--card-bg)', borderRadius: 'var(--radius-lg)',
                    padding: 20, border: '1px solid var(--border)',
                    boxShadow: 'var(--shadow-md)', marginBottom: 24,
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                        <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 18, verticalAlign: 'middle', marginRight: 6 }}>target</span>
                            Progresso de Pagamentos
                        </span>
                        <span style={{
                            fontSize: '0.8rem', fontWeight: 800, color: 'var(--primary)',
                            background: 'var(--primary-light)', padding: '4px 12px',
                            borderRadius: 'var(--radius-full)',
                        }}>
                            {paidPercentage.toFixed(1)}%
                        </span>
                    </div>
                    <div style={{
                        width: '100%', background: 'var(--border)', borderRadius: 'var(--radius-full)', height: 10,
                    }}>
                        <div style={{
                            background: 'linear-gradient(135deg, var(--primary), var(--success))',
                            height: '100%', borderRadius: 'var(--radius-full)',
                            transition: 'width 0.5s ease', width: `${paidPercentage}%`,
                            boxShadow: paidPercentage > 0 ? '0 2px 8px rgba(230, 0, 126, 0.3)' : undefined,
                        }} />
                    </div>
                </div>
            )}
        </div>
    );
}
