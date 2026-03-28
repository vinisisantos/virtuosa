'use client';
import React from 'react';
import { LogEntry, fmt, UNITS, cardS } from '@/hooks/useDashboard';

interface Props {
  logs: LogEntry[];
  selectedMonth: number;
  selectedYear: number;
}

const COMMISSION_RATES: Record<string, number> = {
  VENDEDOR: 5,
  ESTETICISTA: 3,
  GERENTE: 2,
  ADMINISTRADOR: 0,
};

export function CommissionsView({ logs, selectedMonth, selectedYear }: Props) {
  const sales = logs.filter(l => {
    if (l.type !== 'sale' || !l.date) return false;
    const d = new Date(l.date);
    return d.getUTCMonth() === selectedMonth && d.getUTCFullYear() === selectedYear;
  });

  // Group by seller
  const sellerMap: Record<string, { sales: number; count: number; avgTicket: number }> = {};
  sales.forEach(s => {
    const seller = s.seller || s.name || 'Sem Vendedor';
    if (!sellerMap[seller]) sellerMap[seller] = { sales: 0, count: 0, avgTicket: 0 };
    sellerMap[seller].sales += s.value;
    sellerMap[seller].count += 1;
  });
  Object.values(sellerMap).forEach(v => { v.avgTicket = v.count > 0 ? v.sales / v.count : 0; });

  const sorted = Object.entries(sellerMap).sort((a, b) => b[1].sales - a[1].sales);
  const totalCommissions = sorted.reduce((s, [, v]) => s + v.sales * 0.05, 0);

  // Per-unit breakdown
  const unitSales: Record<string, number> = {};
  UNITS.forEach(u => { unitSales[u] = 0; });
  sales.forEach(s => { const u = s.unit || 'Barueri'; unitSales[u] = (unitSales[u] || 0) + s.value; });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
        <div style={{ ...cardS, padding: '20px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 24, color: '#10b981', background: 'rgba(16,185,129,0.1)', borderRadius: 10, padding: 6 }}>payments</span>
            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)' }}>Total Comissões (5%)</span>
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#10b981' }}>{fmt(totalCommissions)}</div>
        </div>
        <div style={{ ...cardS, padding: '20px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 24, color: '#6366f1', background: 'rgba(99,102,241,0.1)', borderRadius: 10, padding: 6 }}>group</span>
            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)' }}>Vendedores Ativos</span>
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 900, color: 'var(--text-main)' }}>{sorted.length}</div>
        </div>
        <div style={{ ...cardS, padding: '20px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 24, color: 'var(--primary)', background: 'rgba(230,0,160,0.1)', borderRadius: 10, padding: 6 }}>shopping_bag</span>
            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)' }}>Total Vendas</span>
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 900, color: 'var(--text-main)' }}>{sales.length}</div>
        </div>
      </div>

      {/* Seller Ranking */}
      <div style={cardS}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 22, color: '#f59e0b' }}>emoji_events</span>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: 'var(--text-main)' }}>Ranking de Vendedores</h3>
        </div>

        {sorted.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-muted)' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 44, opacity: 0.3 }}>person_off</span>
            <p style={{ fontWeight: 600, marginTop: 8 }}>Nenhuma venda registrada neste mês</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {sorted.map(([seller, data], i) => {
              const commission = data.sales * 0.05;
              const maxSales = sorted[0][1].sales;
              const pct = maxSales > 0 ? (data.sales / maxSales) * 100 : 0;
              const medals = ['🥇', '🥈', '🥉'];
              return (
                <div key={seller} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderRadius: 14, background: i === 0 ? 'rgba(245,158,11,0.06)' : 'transparent' }}>
                  <div style={{ width: 32, height: 32, borderRadius: 10, background: i < 3 ? '#f59e0b15' : 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: i < 3 ? '1.1rem' : '0.8rem', fontWeight: 900, color: 'var(--text-muted)' }}>
                    {i < 3 ? medals[i] : `${i + 1}º`}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-main)' }}>{seller}</div>
                    <div style={{ marginTop: 4, height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: 'linear-gradient(90deg, var(--primary), #f59e0b)', borderRadius: 3, transition: 'width 0.5s ease' }} />
                    </div>
                    <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{data.count} vendas</span>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Ticket médio: {fmt(data.avgTicket)}</span>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '0.92rem', fontWeight: 800, color: 'var(--text-main)' }}>{fmt(data.sales)}</div>
                    <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#10b981' }}>Comissão: {fmt(commission)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
