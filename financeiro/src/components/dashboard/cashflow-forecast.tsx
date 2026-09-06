'use client';
import React from 'react';
import { LogEntry, fmt, cardS } from '@/hooks/useDashboard';

interface Props {
  logs: LogEntry[];
  selectedMonth: number;
  selectedYear: number;
  monthlyEvolution: { month: string; rev: number; cost: number }[];
  totalRev: number;
  totalCost: number;
  margin: number;
}

export function CashflowForecast({ monthlyEvolution, totalRev, totalCost, margin }: Props) {
  // Build simple bar chart data from monthly evolution
  const chartData = monthlyEvolution.slice(-6);
  const maxVal = Math.max(...chartData.map(m => Math.max(m.rev, m.cost)), 1);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Monthly Evolution Chart */}
      <div style={cardS}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 22, color: 'var(--primary)' }}>show_chart</span>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: 'var(--text-main)' }}>Evolução Mensal</h3>
          </div>
          <div style={{ display: 'flex', gap: 14 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)' }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: '#10b981' }} /> Receita
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)' }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: '#ef4444' }} /> Custos
            </span>
          </div>
        </div>

        {/* Bar chart */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, height: 160, padding: '0 4px' }}>
          {chartData.map((m, i) => {
            const revH = (m.rev / maxVal) * 140;
            const costH = (m.cost / maxVal) * 140;
            return (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end', height: 140 }}>
                  <div style={{ width: 18, height: revH, background: 'linear-gradient(180deg, #10b981, #059669)', borderRadius: '4px 4px 0 0', transition: 'height 0.4s' }} title={`Receita: ${fmt(m.rev)}`} />
                  <div style={{ width: 18, height: costH, background: 'linear-gradient(180deg, #ef4444, #dc2626)', borderRadius: '4px 4px 0 0', transition: 'height 0.4s' }} title={`Custos: ${fmt(m.cost)}`} />
                </div>
                <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)' }}>{m.month.slice(0, 3)}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* KPIs row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
        {[
          { icon: 'trending_up', color: '#10b981', label: 'Receita Atual', value: fmt(totalRev) },
          { icon: 'trending_down', color: '#ef4444', label: 'Custos Atuais', value: fmt(totalCost) },
          { icon: 'account_balance', color: '#3b82f6', label: 'Resultado', value: fmt(totalRev - totalCost) },
          { icon: 'donut_small', color: '#f59e0b', label: 'Margem', value: `${margin.toFixed(1)}%` },
        ].map(kpi => (
          <div key={kpi.label} style={{ ...cardS, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: `${kpi.color}12`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 20, color: kpi.color }}>{kpi.icon}</span>
            </div>
            <div>
              <div style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' as const }}>{kpi.label}</div>
              <div style={{ fontSize: '1.15rem', fontWeight: 900, color: 'var(--text-main)' }}>{kpi.value}</div>
            </div>
          </div>
        ))}
      </div>

    </div>
  );
}
