'use client';
import React from 'react';
import { LogEntry, fmt, UNITS, cardS } from '@/hooks/useDashboard';

interface Props {
  logs: LogEntry[];
  selectedMonth: number;
  selectedYear: number;
}

const UNIT_COLORS: Record<string, string> = { Barueri: '#6366f1', Osasco: '#10b981', SBC: '#f59e0b', SCS: '#e600a0' };

export function UnitComparisonView({ logs, selectedMonth, selectedYear }: Props) {
  const monthLogs = logs.filter(l => {
    if (!l.date) return false;
    const d = new Date(l.date);
    return d.getUTCMonth() === selectedMonth && d.getUTCFullYear() === selectedYear;
  });

  const unitData = UNITS.map(unit => {
    const unitLogs = monthLogs.filter(l => (l.unit || 'Barueri') === unit);
    const sales = unitLogs.filter(l => l.type === 'sale');
    const costs = unitLogs.filter(l => l.type === 'cost');
    const revenue = sales.reduce((s, l) => s + l.value, 0);
    const expense = costs.reduce((s, l) => s + l.value, 0);
    const profit = revenue - expense;
    const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
    const avgTicket = sales.length > 0 ? revenue / sales.length : 0;
    return { unit, revenue, expense, profit, margin, avgTicket, salesCount: sales.length };
  });

  unitData.sort((a, b) => b.revenue - a.revenue);
  const maxRevenue = unitData[0]?.revenue || 1;
  const totalRevenue = unitData.reduce((s, u) => s + u.revenue, 0);
  const medals = ['🥇', '🥈', '🥉', '4º'];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* ─── Participation Bar ─── */}
      <div style={{ ...cardS, padding: '16px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--primary)' }}>leaderboard</span>
          <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 900, color: 'var(--text-main)' }}>Participação por Unidade</h3>
        </div>

        {/* Stacked progress bar */}
        <div style={{ display: 'flex', height: 12, borderRadius: 6, overflow: 'hidden', background: 'var(--border)' }}>
          {unitData.filter(u => u.revenue > 0).map(u => (
            <div key={u.unit} style={{
              width: `${totalRevenue > 0 ? (u.revenue / totalRevenue) * 100 : 0}%`,
              background: UNIT_COLORS[u.unit], transition: 'width 0.5s ease', minWidth: 2,
            }} />
          ))}
        </div>

        {/* Legend — 2x2 grid on mobile */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 12px', marginTop: 10 }}>
          {unitData.map(u => (
            <div key={u.unit} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 9, height: 9, borderRadius: 3, background: UNIT_COLORS[u.unit], flexShrink: 0 }} />
              <span style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--text-main)' }}>{u.unit}</span>
              <span style={{ fontSize: '0.73rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                {totalRevenue > 0 ? `${((u.revenue / totalRevenue) * 100).toFixed(0)}%` : '0%'}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ─── Unit Cards — 1 coluna em mobile, 2 em desktop ─── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
        {unitData.map((u, i) => {
          const color = UNIT_COLORS[u.unit];
          return (
            <div key={u.unit} style={{
              background: 'var(--card-bg)', borderRadius: 18, border: '1px solid var(--border)',
              boxShadow: 'var(--shadow-sm)', overflow: 'hidden',
            }}>
              {/* Color accent bar */}
              <div style={{ height: 4, background: color }} />

              <div style={{ padding: '14px 14px 16px' }}>
                {/* Header: medal + name | revenue */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
                    <span style={{ fontSize: '1.15rem', flexShrink: 0 }}>{medals[i]}</span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: '1rem', fontWeight: 900, color: 'var(--text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.unit}</div>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 600 }}>{u.salesCount} venda{u.salesCount !== 1 ? 's' : ''} no mês</div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: '1rem', fontWeight: 900, color, lineHeight: 1.15 }}>{fmt(u.revenue)}</div>
                    <div style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>receita</div>
                  </div>
                </div>

                {/* Progress bar relative to leader */}
                <div style={{ height: 5, background: 'var(--border)', borderRadius: 3, overflow: 'hidden', marginBottom: 12 }}>
                  <div style={{ width: `${(u.revenue / maxRevenue) * 100}%`, height: '100%', background: `linear-gradient(90deg, ${color}, ${color}aa)`, borderRadius: 3, transition: 'width 0.6s ease' }} />
                </div>

                {/* Stats 2x2 */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <StatBox icon="arrow_downward" iconColor="#ef4444" label="Custos" value={fmt(u.expense)} />
                  <StatBox icon={u.profit >= 0 ? 'arrow_upward' : 'arrow_downward'} iconColor={u.profit >= 0 ? '#10b981' : '#ef4444'} label="Lucro" value={fmt(u.profit)} />
                  <StatBox icon="donut_small" iconColor="#f59e0b" label="Margem" value={`${u.margin.toFixed(1)}%`} />
                  <StatBox icon="local_activity" iconColor="#6366f1" label="Ticket Médio" value={fmt(u.avgTicket)} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StatBox({ icon, iconColor, label, value }: { icon: string; iconColor: string; label: string; value: string }) {
  return (
    <div style={{ background: 'var(--bg)', borderRadius: 10, padding: '9px 10px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 3 }}>
        <span className="material-symbols-outlined" style={{ fontSize: 14, color: iconColor }}>{icon}</span>
        <span style={{ fontSize: '0.63rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.3px' }}>{label}</span>
      </div>
      <div style={{ fontSize: '0.87rem', fontWeight: 900, color: 'var(--text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</div>
    </div>
  );
}
