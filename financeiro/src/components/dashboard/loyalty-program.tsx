'use client';
import React, { useState, useEffect } from 'react';
import { cardS } from '@/hooks/useDashboard';

interface LoyaltyClient { clientId: string; clientName: string; earned: number; redeemed: number; balance: number; }
interface Rules { POINTS_PER_VISIT: number; POINTS_PER_100_REAIS: number; BIRTHDAY_BONUS: number; }

export function LoyaltyProgram() {
  const [leaderboard, setLeaderboard] = useState<LoyaltyClient[]>([]);
  const [rules, setRules] = useState<Rules | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ clientId: '', clientName: '', reason: 'visit', type: 'earn', amount: '' });

  const fetchData = async () => {
    const res = await fetch('/api/loyalty');
    const data = await res.json();
    setLeaderboard(data.leaderboard || []);
    setRules(data.rules || null);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const addPoints = async () => {
    if (!form.clientName) return;
    await fetch('/api/loyalty', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, clientId: form.clientId || form.clientName.toLowerCase().replace(/\s/g, '-'), amount: form.amount ? parseFloat(form.amount) : undefined }),
    });
    setShowAdd(false);
    setForm({ clientId: '', clientName: '', reason: 'visit', type: 'earn', amount: '' });
    fetchData();
  };

  const REASON_LABELS: Record<string, { label: string; icon: string }> = {
    visit: { label: 'Visita', icon: '🏥' },
    purchase: { label: 'Compra', icon: '🛍️' },
    birthday: { label: 'Aniversário', icon: '🎂' },
    referral: { label: 'Indicação', icon: '🤝' },
    redeem: { label: 'Resgate', icon: '🎁' },
  };

  const inputS: React.CSSProperties = { width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)', fontSize: '0.85rem', outline: 'none', background: 'var(--bg)', color: 'var(--text-main)', fontFamily: 'inherit', fontWeight: 600, boxSizing: 'border-box' as const };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 28 }}>⭐</span>
          <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 900 }}>Programa de Fidelidade</h3>
        </div>
        <button onClick={() => setShowAdd(!showAdd)} style={{ padding: '8px 16px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #f59e0b, #eab308)', color: '#fff', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add</span> Registrar Pontos
        </button>
      </div>

      {/* Rules card */}
      {rules && (
        <div style={{ ...cardS, padding: '14px 18px', background: 'rgba(245,158,11,0.03)', border: '1px solid rgba(245,158,11,0.15)' }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#f59e0b', textTransform: 'uppercase' as const, marginBottom: 8 }}>Regras de Pontuação</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span>🏥</span><span style={{ fontSize: '0.78rem', fontWeight: 600 }}>{rules.POINTS_PER_VISIT} pts/visita</span></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span>🛍️</span><span style={{ fontSize: '0.78rem', fontWeight: 600 }}>{rules.POINTS_PER_100_REAIS} pts/R$ 100</span></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span>🎂</span><span style={{ fontSize: '0.78rem', fontWeight: 600 }}>{rules.BIRTHDAY_BONUS} pts aniversário</span></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span>🤝</span><span style={{ fontSize: '0.78rem', fontWeight: 600 }}>25 pts/indicação</span></div>
          </div>
        </div>
      )}

      {/* Add Form */}
      {showAdd && (
        <div style={{ ...cardS, padding: 16, border: '1px dashed rgba(245,158,11,0.3)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <input placeholder="Nome do cliente *" value={form.clientName} onChange={e => setForm({ ...form, clientName: e.target.value })} style={inputS} />
            <select value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} style={inputS}>
              {Object.entries(REASON_LABELS).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
            </select>
            <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} style={inputS}>
              <option value="earn">➕ Ganhar</option>
              <option value="redeem">🎁 Resgatar</option>
            </select>
            {form.reason === 'purchase' && <input type="number" placeholder="Valor compra (R$)" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} style={inputS} />}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
            <button onClick={() => setShowAdd(false)} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-muted)', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.78rem' }}>Cancelar</button>
            <button onClick={addPoints} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#f59e0b', color: '#fff', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.78rem' }}>Registrar</button>
          </div>
        </div>
      )}

      {/* Leaderboard */}
      {loading ? <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 20 }}>Carregando...</div> : leaderboard.length === 0 ? (
        <div style={{ ...cardS, textAlign: 'center', padding: '32px 0' }}>
          <span style={{ fontSize: 40, opacity: 0.3 }}>⭐</span>
          <p style={{ color: 'var(--text-muted)', marginTop: 8, fontSize: '0.85rem' }}>Nenhum ponto registrado ainda</p>
        </div>
      ) : (
        <div style={cardS}>
          <div style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' as const, marginBottom: 12 }}>🏆 Ranking de Fidelidade</div>
          {leaderboard.map((c, i) => (
            <div key={c.clientId} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: i < leaderboard.length - 1 ? '1px solid var(--border)' : 'none' }}>
              <div style={{ width: 32, height: 32, borderRadius: 10, background: i === 0 ? '#f59e0b' : i === 1 ? '#94a3b8' : i === 2 ? '#cd7f32' : 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: i < 3 ? '#fff' : 'var(--text-muted)', fontWeight: 900, fontSize: '0.82rem' }}>
                {i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '0.88rem', fontWeight: 800 }}>{c.clientName}</div>
                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Ganhou {c.earned} • Resgatou {c.redeemed}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '1.1rem', fontWeight: 900, color: '#f59e0b' }}>{c.balance}</div>
                <div style={{ fontSize: '0.62rem', fontWeight: 600, color: 'var(--text-muted)' }}>pontos</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
