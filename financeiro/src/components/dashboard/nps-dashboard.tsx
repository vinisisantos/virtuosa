'use client';
import React, { useState, useEffect } from 'react';
import { cardS } from '@/hooks/useDashboard';

interface Stats { nps: number; total: number; promoters: number; detractors: number; passives: number; }
interface ProcData { name: string; avg: number; count: number; recentFeedback: string[]; }
interface Distribution { score: number; count: number; }
interface Survey { id: string; clientName: string; score: number; feedback: string | null; procedimento: string | null; createdAt: string; }

export function NpsDashboard() {
  const [stats, setStats] = useState<Stats>({ nps: 0, total: 0, promoters: 0, detractors: 0, passives: 0 });
  const [byProcedure, setByProcedure] = useState<ProcData[]>([]);
  const [distribution, setDistribution] = useState<Distribution[]>([]);
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ clientName: '', score: '8', feedback: '', procedimento: '', unit: 'SCS' });

  const fetchData = async () => {
    const res = await fetch('/api/surveys');
    const data = await res.json();
    setStats(data.stats || {});
    setByProcedure(data.byProcedure || []);
    setDistribution(data.distribution || []);
    setSurveys(data.surveys || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const submitSurvey = async () => {
    if (!form.clientName) return;
    await fetch('/api/surveys', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, score: parseInt(form.score) }) });
    setShowAdd(false);
    setForm({ clientName: '', score: '8', feedback: '', procedimento: '', unit: 'SCS' });
    fetchData();
  };

  const npsColor = stats.nps >= 50 ? '#10b981' : stats.nps >= 0 ? '#f59e0b' : '#ef4444';
  const npsLabel = stats.nps >= 75 ? 'Excelente' : stats.nps >= 50 ? 'Muito Bom' : stats.nps >= 0 ? 'Bom' : 'Crítico';
  const maxDist = Math.max(...distribution.map(d => d.count), 1);
  const inputS: React.CSSProperties = {
    width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid var(--border)',
    fontSize: '0.87rem', outline: 'none', background: 'var(--bg)', color: 'var(--text-main)',
    fontFamily: 'inherit', fontWeight: 600, boxSizing: 'border-box' as const, height: 46,
  };

  if (loading) return <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Carregando...</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
          <span style={{ fontSize: 22, flexShrink: 0 }}>📊</span>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 900, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            Pesquisa de Satisfação (NPS)
          </h3>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          style={{
            padding: '8px 12px', borderRadius: 10, border: 'none',
            background: 'linear-gradient(135deg, #10b981, #059669)',
            color: '#fff', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
            fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: 5,
            flexShrink: 0, whiteSpace: 'nowrap', minHeight: 38,
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span>
          Nova Pesquisa
        </button>
      </div>

      {/* ── NPS Score — row: score card + 3 mini cards ── */}
      <div style={{ display: 'flex', gap: 10 }}>
        {/* Big NPS score */}
        <div style={{
          ...cardS, padding: '16px 12px', textAlign: 'center',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          border: `1px solid ${npsColor}22`, minWidth: 80, flexShrink: 0,
        }}>
          <div style={{ fontSize: '2.4rem', fontWeight: 900, color: npsColor, lineHeight: 1 }}>{stats.nps}</div>
          <div style={{ fontSize: '0.7rem', fontWeight: 800, color: npsColor, marginTop: 3 }}>{npsLabel}</div>
          <div style={{ fontSize: '0.58rem', color: 'var(--text-muted)', marginTop: 2 }}>NPS Score</div>
        </div>

        {/* 3 mini cards stacked */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
          {[
            { icon: '😊', label: 'Promotoras', range: '9-10', value: stats.promoters, color: '#10b981' },
            { icon: '😐', label: 'Neutras', range: '7-8', value: stats.passives, color: '#f59e0b' },
            { icon: '😞', label: 'Detratoras', range: '0-6', value: stats.detractors, color: '#ef4444' },
          ].map(item => (
            <div key={item.label} style={{
              ...cardS, padding: '8px 12px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 16, flexShrink: 0 }}>{item.icon}</span>
                <div>
                  <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)' }}>{item.label}</div>
                  <div style={{ fontSize: '0.58rem', color: 'var(--text-muted)' }}>({item.range})</div>
                </div>
              </div>
              <div style={{ fontSize: '1.3rem', fontWeight: 900, color: item.color }}>{item.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Distribuição de Notas ── */}
      <div style={{ ...cardS, padding: '14px 12px' }}>
        <div style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.4px', marginBottom: 10 }}>
          Distribuição de Notas
        </div>
        <div style={{ display: 'flex', gap: 5, alignItems: 'flex-end', justifyContent: 'center', height: 64 }}>
          {distribution.length === 0 ? (
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', alignSelf: 'center' }}>Sem dados</span>
          ) : distribution.map(d => (
            <div key={d.score} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, flex: 1 }}>
              <div style={{
                width: '100%', maxWidth: 28, height: Math.max(4, (d.count / maxDist) * 50),
                borderRadius: '4px 4px 0 0',
                background: d.score >= 9 ? '#10b981' : d.score >= 7 ? '#f59e0b' : '#ef4444',
                transition: 'height 0.3s',
              }} />
              <span style={{ fontSize: '0.58rem', fontWeight: 700, color: 'var(--text-muted)' }}>{d.score}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Add Form ── */}
      {showAdd && (
        <div style={{ ...cardS, padding: '16px 14px', border: '1px dashed rgba(16,185,129,0.35)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <input placeholder="Nome do cliente *" value={form.clientName} onChange={e => setForm({ ...form, clientName: e.target.value })} style={inputS} />
              <input placeholder="Procedimento" value={form.procedimento} onChange={e => setForm({ ...form, procedimento: e.target.value })} style={inputS} />
            </div>
            {/* Score slider */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--bg)', borderRadius: 10, padding: '10px 14px' }}>
              <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', flexShrink: 0 }}>Nota:</span>
              <input type="range" min={0} max={10} value={form.score} onChange={e => setForm({ ...form, score: e.target.value })} style={{ flex: 1 }} />
              <span style={{
                fontSize: '1.2rem', fontWeight: 900, minWidth: 28, textAlign: 'center',
                color: parseInt(form.score) >= 9 ? '#10b981' : parseInt(form.score) >= 7 ? '#f59e0b' : '#ef4444',
              }}>{form.score}</span>
            </div>
            <input placeholder="Feedback (opcional)" value={form.feedback} onChange={e => setForm({ ...form, feedback: e.target.value })} style={inputS} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
            <button onClick={submitSurvey}
              style={{ padding: '12px', borderRadius: 10, border: 'none', background: '#10b981', color: '#fff', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.87rem', minHeight: 46 }}>
              Registrar
            </button>
            <button onClick={() => setShowAdd(false)}
              style={{ padding: '10px', borderRadius: 10, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.82rem' }}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* ── Por Procedimento + Feedbacks ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
        <div style={cardS}>
          <div style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.4px', marginBottom: 10 }}>
            Por Procedimento
          </div>
          {byProcedure.length === 0 ? (
            <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', textAlign: 'center', padding: 16 }}>Sem dados</div>
          ) : byProcedure.map(p => (
            <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{p.count} avaliações</div>
              </div>
              <div style={{ fontSize: '1.1rem', fontWeight: 900, color: p.avg >= 9 ? '#10b981' : p.avg >= 7 ? '#f59e0b' : '#ef4444', flexShrink: 0 }}>{p.avg}</div>
            </div>
          ))}
        </div>

        <div style={cardS}>
          <div style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.4px', marginBottom: 10 }}>
            Feedbacks Recentes
          </div>
          {surveys.filter(s => s.feedback).length === 0 ? (
            <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', textAlign: 'center', padding: 16 }}>Sem feedbacks</div>
          ) : surveys.filter(s => s.feedback).slice(0, 8).map(s => (
            <div key={s.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <div style={{
                width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                background: s.score >= 9 ? 'rgba(16,185,129,0.1)' : s.score >= 7 ? 'rgba(245,158,11,0.1)' : 'rgba(239,68,68,0.1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.82rem', fontWeight: 900,
                color: s.score >= 9 ? '#10b981' : s.score >= 7 ? '#f59e0b' : '#ef4444',
              }}>{s.score}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.78rem', fontWeight: 700 }}>{s.clientName}</div>
                <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)', fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>"{s.feedback}"</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
