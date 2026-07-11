'use client';

import { useMemo } from 'react';
import type { PayrollEntryData, PayrollImportData, PayrollSummary } from '@/lib/types';
import { useGlobalUnit } from '@/contexts/UnitContext';

interface SummaryCardsProps {
    summary: PayrollSummary;
    selectedUnit?: string;
    imports: PayrollImportData[];
}

function formatBRL(value: number): string {
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}



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

function summarizeEntries(entries: PayrollEntryData[]): PayrollSummary {
    const effectiveSalary = (entry: PayrollEntryData) => entry.hasPenalty ? entry.netSalary * 1.1 : entry.netSalary;
    return {
        totalPayroll: entries.reduce((sum, entry) => sum + effectiveSalary(entry), 0),
        totalPaid: entries.filter(entry => entry.paymentStatus === 'paid').reduce((sum, entry) => sum + effectiveSalary(entry), 0),
        totalPending: entries.filter(entry => entry.paymentStatus !== 'paid').reduce((sum, entry) => sum + effectiveSalary(entry), 0),
        totalEmployees: entries.length,
        paidCount: entries.filter(entry => entry.paymentStatus === 'paid').length,
        pendingCount: entries.filter(entry => entry.paymentStatus === 'unpaid').length,
        reviewCount: entries.filter(entry => entry.paymentStatus === 'review').length,
        totalBaseSalary: entries.reduce((sum, entry) => sum + (entry.baseSalary || 0), 0),
        totalBonus: entries.reduce((sum, entry) => sum + (entry.bonus || 0), 0),
    };
}

export function SummaryCards({ summary, selectedUnit, imports }: SummaryCardsProps) {
    const { units: UNITS } = useGlobalUnit();
    const unitSummaries = useMemo(() => {
        if (selectedUnit !== 'all') return {};
        const grouped = new Map<string, PayrollEntryData[]>();
        for (const payrollImport of imports) {
            if (!payrollImport.unit) continue;
            const entries = grouped.get(payrollImport.unit) || [];
            entries.push(...payrollImport.entries);
            grouped.set(payrollImport.unit, entries);
        }
        return Object.fromEntries(
            [...grouped.entries()].map(([unit, entries]) => [unit, summarizeEntries(entries)]),
        );
    }, [imports, selectedUnit]);

    // FGTS = 8% of base salary (or net salary when base not available)
    const fgtsBase = summary.totalBaseSalary > 0 ? summary.totalBaseSalary : summary.totalPayroll;
    const totalFGTS = fgtsBase * 0.08;

    const cards = [
        {
            label: 'Salário Base',
            value: summary.totalBaseSalary > 0 ? formatBRL(summary.totalBaseSalary) : '—',
            sub: `${summary.totalEmployees} colaboradores`,
            icon: 'account_balance',
            accentColor: '#6366f1',
            iconBg: 'rgba(99,102,241,0.1)',
            iconColor: '#6366f1',
        },
        {
            label: 'Salário Líquido',
            value: formatBRL(summary.totalPayroll),
            sub: `${summary.paidCount} pagos · ${summary.pendingCount} pendentes`,
            icon: 'payments',
            accentColor: 'var(--primary)',
            iconBg: 'var(--primary-light)',
            iconColor: 'var(--primary)',
        },
        {
            label: 'FGTS (8%)',
            value: totalFGTS > 0 ? formatBRL(totalFGTS) : '—',
            sub: 'Fundo de Garantia',
            icon: 'savings',
            accentColor: '#0ea5e9',
            iconBg: 'rgba(14,165,233,0.1)',
            iconColor: '#0ea5e9',
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
