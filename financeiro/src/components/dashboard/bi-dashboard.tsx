'use client';
import React, { useState } from 'react';
import { LogEntry, fmt, cardS } from '@/hooks/useDashboard';
import DOMPurify from 'dompurify';
import { isOperationalSale } from '@/lib/revenue';

interface Props {
  logs: LogEntry[];
  selectedMonth: number;
  selectedYear: number;
  monthlyEvolution: { month: string; rev: number; cost: number }[];
  totalRev: number;
  totalCost: number;
  margin: number;
}

interface BiData {
  score: number; scoreLabel: string;
  insights: { type: string; icon: string; title: string; description: string; priority: string }[];
  kpis: { label: string; value: string; trend: string; change: string }[];
  summary: string;
}

export function BiDashboard({ logs, selectedMonth, selectedYear, monthlyEvolution, totalRev, totalCost, margin }: Props) {
  const [bi, setBi] = useState<BiData | null>(null);
  const [loading, setLoading] = useState(false);

  // Build top procedures from logs
  const procMap: Record<string, { count: number; revenue: number }> = {};
  logs.filter(isOperationalSale).forEach(l => {
    const name = l.category || 'Outros';
    if (!procMap[name]) procMap[name] = { count: 0, revenue: 0 };
    procMap[name].count++;
    procMap[name].revenue += l.value;
  });
  const topProcedures = Object.entries(procMap).map(([name, d]) => ({ name, ...d })).sort((a, b) => b.revenue - a.revenue).slice(0, 10);

  const loadBi = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/bi-insights', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ monthlyEvolution, totalRev, totalCost, margin, topProcedures }),
      });
      const data = await res.json();
      if (data.success) setBi(data.bi);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  const PRIORITY_COLORS: Record<string, string> = { high: '#ef4444', medium: '#f59e0b', low: '#3b82f6' };
  const TREND_ICONS: Record<string, { icon: string; color: string }> = {
    up: { icon: 'trending_up', color: '#10b981' },
    down: { icon: 'trending_down', color: '#ef4444' },
    stable: { icon: 'trending_flat', color: '#f59e0b' },
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {!bi && !loading && (
        <div style={{ ...cardS, textAlign: 'center', padding: '48px 24px', border: '1px dashed rgba(99,102,241,0.3)' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 56, color: '#6366f1', opacity: 0.6 }}>smart_toy</span>
          <h3 style={{ margin: '16px 0 8px', fontSize: '1.2rem', fontWeight: 900 }}>Business Intelligence com IA</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', maxWidth: 400, margin: '0 auto 24px' }}>
            A IA vai analisar todos os seus dados financeiros, agenda, clientes e pagamentos para gerar insights estratégicos personalizados.
          </p>
          <button onClick={loadBi} style={{
            padding: '14px 32px', borderRadius: 14, border: 'none',
            background: 'linear-gradient(135deg, #6366f1, #4f46e5)', color: '#fff',
            fontWeight: 800, fontSize: '0.92rem', cursor: 'pointer', fontFamily: 'inherit',
            display: 'inline-flex', alignItems: 'center', gap: 8, boxShadow: '0 8px 24px rgba(99,102,241,0.3)',
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 22 }}>auto_awesome</span>
            Gerar Análise Completa
          </button>
        </div>
      )}

      {loading && (
        <div style={{ ...cardS, textAlign: 'center', padding: '48px 24px' }}>
          <div style={{ width: 48, height: 48, border: '3px solid var(--border)', borderTop: '3px solid #6366f1', borderRadius: '50%', margin: '0 auto', animation: 'spin 1s linear infinite' }} />
          <p style={{ color: 'var(--text-muted)', marginTop: 16, fontWeight: 600 }}>🤖 Analisando dados com IA...</p>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>Financeiro, agenda, clientes e pagamentos</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {bi && (
        <>
          {/* Score card */}
          <div style={{ ...cardS, display: 'flex', alignItems: 'center', gap: 24, border: '1px solid rgba(99,102,241,0.15)', background: 'rgba(99,102,241,0.02)' }}>
            <div style={{ position: 'relative', width: 90, height: 90, flexShrink: 0 }}>
              <svg width={90} height={90} viewBox="0 0 90 90">
                <circle cx={45} cy={45} r={38} fill="none" stroke="var(--border)" strokeWidth={6} />
                <circle cx={45} cy={45} r={38} fill="none" stroke={bi.score >= 70 ? '#10b981' : bi.score >= 40 ? '#f59e0b' : '#ef4444'} strokeWidth={6}
                  strokeLinecap="round" strokeDasharray={`${(bi.score / 100) * 239} 239`}
                  transform="rotate(-90 45 45)" style={{ transition: 'stroke-dasharray 1s' }} />
              </svg>
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: '1.5rem', fontWeight: 900, color: 'var(--text-main)' }}>{bi.score}</span>
                <span style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--text-muted)' }}>{bi.scoreLabel}</span>
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <h3 style={{ margin: '0 0 8px', fontSize: '1rem', fontWeight: 900 }}>Score de Saúde do Negócio</h3>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-main)', lineHeight: 1.7 }}
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(bi.summary.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')) }} />
            </div>
            <button onClick={() => { setBi(null); }} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-muted)', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.72rem' }}>
              Nova Análise
            </button>
          </div>

          {/* KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            {bi.kpis.map((kpi, i) => {
              const trend = TREND_ICONS[kpi.trend] || TREND_ICONS.stable;
              return (
                <div key={i} style={{ ...cardS, padding: '16px 20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' as const }}>{kpi.label}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 16, color: trend.color }}>{trend.icon}</span>
                      <span style={{ fontSize: '0.72rem', fontWeight: 700, color: trend.color }}>{kpi.change}</span>
                    </div>
                  </div>
                  <div style={{ fontSize: '1.3rem', fontWeight: 900, color: 'var(--text-main)' }}>{kpi.value}</div>
                </div>
              );
            })}
          </div>

          {/* Insights */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#6366f1' }}>lightbulb</span>
              Insights Estratégicos
            </h3>
            {bi.insights.map((ins, i) => (
              <div key={i} style={{ ...cardS, padding: '16px 20px', display: 'flex', gap: 14, alignItems: 'flex-start', borderLeft: `3px solid ${PRIORITY_COLORS[ins.priority] || '#6366f1'}` }}>
                <span style={{ fontSize: '1.4rem', flexShrink: 0, marginTop: 2 }}>{ins.icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: '0.88rem', fontWeight: 800, color: 'var(--text-main)' }}>{ins.title}</span>
                    <span style={{ fontSize: '0.62rem', fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: `${PRIORITY_COLORS[ins.priority]}15`, color: PRIORITY_COLORS[ins.priority] }}>{ins.priority}</span>
                    <span style={{ fontSize: '0.62rem', fontWeight: 600, padding: '2px 6px', borderRadius: 4, background: 'rgba(99,102,241,0.06)', color: '#6366f1' }}>{ins.type}</span>
                  </div>
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.6 }}
                    dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(ins.description.replace(/\*\*(.*?)\*\*/g, '<strong style="color:var(--text-main)">$1</strong>')) }} />
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
