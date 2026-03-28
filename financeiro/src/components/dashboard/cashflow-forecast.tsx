'use client';
import React, { useState } from 'react';
import { LogEntry, fmt, cardS } from '@/hooks/useDashboard';

const MONTHS = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
const MONTHS_FULL = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

interface Props {
  logs: LogEntry[];
  selectedMonth: number;
  selectedYear: number;
  monthlyEvolution: { month: string; rev: number; cost: number }[];
  totalRev: number;
  totalCost: number;
  margin: number;
}

export function CashflowForecast({ logs, selectedMonth, selectedYear, monthlyEvolution, totalRev, totalCost, margin }: Props) {
  const [forecast, setForecast] = useState<{ prediction: string; confidence: string; analysis: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const loadForecast = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/forecast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ monthlyEvolution, currentMonth: MONTHS[selectedMonth], currentYear: selectedYear, totalRev, totalCost, margin }),
      });
      const data = await res.json();
      if (data.success) setForecast(data.forecast);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

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

      {/* AI Forecast Section */}
      <div style={{ ...cardS, border: '1px solid rgba(99,102,241,0.15)', background: 'rgba(99,102,241,0.02)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 22, color: '#6366f1' }}>auto_awesome</span>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: 'var(--text-main)' }}>Previsão de Faturamento (IA)</h3>
          </div>
          {!forecast && (
            <button onClick={loadForecast} disabled={loading} style={{
              padding: '10px 20px', borderRadius: 12, border: 'none',
              background: 'linear-gradient(135deg, #6366f1, #4f46e5)', color: '#fff',
              fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer', fontFamily: 'inherit',
              opacity: loading ? 0.7 : 1, display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>{loading ? 'progress_activity' : 'auto_awesome'}</span>
              {loading ? 'Analisando...' : 'Gerar Previsão'}
            </button>
          )}
        </div>

        {!forecast && !loading && (
          <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 40, opacity: 0.3 }}>query_stats</span>
            <p style={{ fontSize: '0.85rem', marginTop: 8 }}>Clique em "Gerar Previsão" para a IA analisar seus dados e projetar o próximo mês</p>
          </div>
        )}

        {loading && (
          <div style={{ textAlign: 'center', padding: '30px 0' }}>
            <div style={{ width: 40, height: 40, border: '3px solid var(--border)', borderTop: '3px solid #6366f1', borderRadius: '50%', margin: '0 auto', animation: 'spin 1s linear infinite' }} />
            <p style={{ color: 'var(--text-muted)', marginTop: 12, fontSize: '0.85rem' }}>Analisando tendências com IA...</p>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {forecast && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div style={{ padding: 16, borderRadius: 14, background: 'rgba(99,102,241,0.06)' }}>
                <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' as const, marginBottom: 4 }}>Previsão Próximo Mês</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#6366f1' }}>{forecast.prediction}</div>
              </div>
              <div style={{ padding: 16, borderRadius: 14, background: 'rgba(16,185,129,0.06)' }}>
                <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' as const, marginBottom: 4 }}>Nível de Confiança</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#10b981' }}>{forecast.confidence}</div>
              </div>
            </div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-main)', lineHeight: 1.7, padding: '12px 16px', borderRadius: 12, background: 'var(--bg)' }}
              dangerouslySetInnerHTML={{ __html: forecast.analysis.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br/>') }} />
            <button onClick={() => setForecast(null)} style={{ marginTop: 12, padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-muted)', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.78rem' }}>
              Gerar Nova Previsão
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
