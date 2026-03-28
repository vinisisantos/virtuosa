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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* ─── Participation Bar ─── */}
      <div style={{ ...cardS, padding: '24px 28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 22, color: 'var(--primary)' }}>leaderboard</span>
          <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-main)' }}>Participação por Unidade</h3>
        </div>

        <div style={{ display: 'flex', height: 14, borderRadius: 7, overflow: 'hidden', background: 'var(--border)' }}>
          {unitData.filter(u => u.revenue > 0).map(u => (
            <div key={u.unit} style={{
              width: `${totalRevenue > 0 ? (u.revenue / totalRevenue) * 100 : 0}%`,
              background: UNIT_COLORS[u.unit], transition: 'width 0.5s ease', minWidth: 2,
            }} />
          ))}
        </div>

        <div style={{ display: 'flex', gap: 20, marginTop: 12, flexWrap: 'wrap' }}>
          {unitData.map(u => (
            <div key={u.unit} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 10, height: 10, borderRadius: 3, background: UNIT_COLORS[u.unit] }} />
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-main)' }}>{u.unit}</span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                {totalRevenue > 0 ? `${((u.revenue / totalRevenue) * 100).toFixed(0)}%` : '0%'}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ─── Unit Cards ─── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
        {unitData.map((u, i) => {
          const color = UNIT_COLORS[u.unit];
          return (
            <div key={u.unit} style={{
              background: 'var(--card-bg)', borderRadius: 20, border: '1px solid var(--border)',
              boxShadow: 'var(--shadow-sm)', overflow: 'hidden', transition: 'transform 0.2s, box-shadow 0.2s',
            }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = 'var(--shadow-md)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'var(--shadow-sm)'; }}
            >
              {/* Color top bar */}
              <div style={{ height: 4, background: color }} />

              <div style={{ padding: '20px 24px' }}>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: '1.3rem' }}>{medals[i]}</span>
                    <div>
                      <div style={{ fontSize: '1.05rem', fontWeight: 900, color: 'var(--text-main)' }}>{u.unit}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>{u.salesCount} vendas no mês</div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '1.2rem', fontWeight: 900, color }}>
                      {fmt(u.revenue)}
                    </div>
                    <div style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' as const }}>receita</div>
                  </div>
                </div>

                {/* Progress bar */}
                <div style={{ height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden', marginBottom: 18 }}>
                  <div style={{ width: `${(u.revenue / maxRevenue) * 100}%`, height: '100%', background: `linear-gradient(90deg, ${color}, ${color}cc)`, borderRadius: 3, transition: 'width 0.6s ease' }} />
                </div>

                {/* Stats 2x2 grid */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
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
    <div style={{ background: 'var(--bg)', borderRadius: 12, padding: '10px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
        <span className="material-symbols-outlined" style={{ fontSize: 15, color: iconColor }}>{icon}</span>
        <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)' }}>{label}</span>
      </div>
      <div style={{ fontSize: '0.88rem', fontWeight: 800, color: 'var(--text-main)' }}>{value}</div>
    </div>
  );
}
