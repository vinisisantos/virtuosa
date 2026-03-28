'use client';
import React from 'react';
import { LogEntry, fmt, UNITS, cardS } from '@/hooks/useDashboard';

interface Props {
  logs: LogEntry[];
  selectedMonth: number;
  selectedYear: number;
}

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

  // Sort by revenue descending
  unitData.sort((a, b) => b.revenue - a.revenue);
  const maxRevenue = unitData[0]?.revenue || 1;
  const totalRevenue = unitData.reduce((s, u) => s + u.revenue, 0);

  const UNIT_COLORS: Record<string, string> = { Barueri: '#6366f1', Osasco: '#10b981', SBC: '#f59e0b', SCS: '#e600a0' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Summary bar */}
      <div style={{ ...cardS, padding: '20px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 22, color: 'var(--primary)' }}>comparison</span>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: 'var(--text-main)' }}>Participação por Unidade</h3>
        </div>
        {/* Stacked bar */}
        <div style={{ display: 'flex', height: 18, borderRadius: 9, overflow: 'hidden', background: 'var(--border)' }}>
          {unitData.filter(u => u.revenue > 0).map(u => (
            <div key={u.unit} style={{ width: `${(u.revenue / totalRevenue) * 100}%`, background: UNIT_COLORS[u.unit] || '#64748b', transition: 'width 0.5s ease', minWidth: 2 }} title={`${u.unit}: ${fmt(u.revenue)}`} />
          ))}
        </div>
        <div style={{ display: 'flex', gap: 16, marginTop: 10, flexWrap: 'wrap' }}>
          {unitData.map(u => (
            <div key={u.unit} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 10, height: 10, borderRadius: 3, background: UNIT_COLORS[u.unit] || '#64748b' }} />
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-main)' }}>{u.unit}</span>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{totalRevenue > 0 ? `${((u.revenue / totalRevenue) * 100).toFixed(0)}%` : '0%'}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Unit ranking cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
        {unitData.map((u, i) => {
          const color = UNIT_COLORS[u.unit] || '#64748b';
          const medals = ['🥇', '🥈', '🥉', '4º'];
          return (
            <div key={u.unit} style={{ ...cardS, padding: '20px 22px', borderLeft: `4px solid ${color}`, transition: 'transform 0.2s', cursor: 'default' }}
              onMouseEnter={e => (e.currentTarget.style.transform = 'translateY(-2px)')}
              onMouseLeave={e => (e.currentTarget.style.transform = 'translateY(0)')}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <span style={{ fontSize: '1.4rem' }}>{medals[i] || `${i + 1}º`}</span>
                <div>
                  <div style={{ fontSize: '1rem', fontWeight: 900, color: 'var(--text-main)' }}>{u.unit}</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600 }}>{u.salesCount} vendas no mês</div>
                </div>
              </div>

              {/* Revenue bar */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)' }}>Receita</span>
                  <span style={{ fontSize: '0.85rem', fontWeight: 900, color }}>{fmt(u.revenue)}</span>
                </div>
                <div style={{ height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ width: `${(u.revenue / maxRevenue) * 100}%`, height: '100%', background: color, borderRadius: 3, transition: 'width 0.5s ease' }} />
                </div>
              </div>

              {/* Stats grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {[
                  { label: 'Custos', value: fmt(u.expense), icon: 'trending_down', iconColor: '#ef4444' },
                  { label: 'Lucro', value: fmt(u.profit), icon: u.profit >= 0 ? 'trending_up' : 'trending_down', iconColor: u.profit >= 0 ? '#10b981' : '#ef4444' },
                  { label: 'Margem', value: `${u.margin.toFixed(1)}%`, icon: 'percent', iconColor: '#f59e0b' },
                  { label: 'Ticket Médio', value: fmt(u.avgTicket), icon: 'confirmation_number', iconColor: '#6366f1' },
                ].map(stat => (
                  <div key={stat.label} style={{ background: 'var(--bg)', borderRadius: 10, padding: '8px 10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 14, color: stat.iconColor }}>{stat.icon}</span>
                      <span style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--text-muted)' }}>{stat.label}</span>
                    </div>
                    <div style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--text-main)' }}>{stat.value}</div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
