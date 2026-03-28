'use client';
import { useState, useEffect, useCallback } from 'react';
import { AppHeader } from '@/components/app-header';
import AuthGuard from '@/components/auth-guard';

interface Client {
  id: string; name: string; phone: string | null; email: string | null;
  unit: string; tags: string | null; totalSpent: number; visitCount: number;
  lastVisit: string | null; stage: string; createdAt: string;
}

const UNITS = ['Barueri', 'Osasco', 'SBC', 'SCS'];
const STAGES = [
  { key: 'entrada', label: 'Entrada', color: '#6366f1' },
  { key: 'em_andamento', label: 'Em Andamento', color: '#f59e0b' },
  { key: 'avaliacao', label: 'Avaliação', color: '#8b5cf6' },
  { key: 'venda', label: 'Venda', color: '#10b981' },
  { key: 'nao_venda', label: 'Não Venda', color: '#ef4444' },
];
const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
const cardS: React.CSSProperties = { background: 'var(--card-bg)', borderRadius: 20, border: '1px solid var(--border)', boxShadow: 'var(--shadow-md)', padding: 24 };
const inputS: React.CSSProperties = { padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)', fontSize: '0.85rem', outline: 'none', background: 'var(--bg)', color: 'var(--text-main)', fontFamily: 'inherit', fontWeight: 600 };

export default function CrmEstatisticaPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [unitFilter, setUnitFilter] = useState('all');

  const fetchClients = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '1000' });
      if (unitFilter !== 'all') params.set('unit', unitFilter);
      const res = await fetch(`/api/clients?${params}`);
      const data = await res.json();
      setClients(data.clients || []);
    } catch { setClients([]); }
    finally { setLoading(false); }
  }, [unitFilter]);

  useEffect(() => { fetchClients(); }, [fetchClients]);

  // Stats
  const total = clients.length;
  const byStage = STAGES.map(s => ({ ...s, count: clients.filter(c => (c.stage || 'entrada') === s.key).length }));
  const vendas = byStage.find(s => s.key === 'venda')?.count || 0;
  const naoVendas = byStage.find(s => s.key === 'nao_venda')?.count || 0;
  const taxaConversao = total > 0 ? ((vendas / total) * 100).toFixed(1) : '0';
  const totalFaturado = clients.filter(c => (c.stage || 'entrada') === 'venda').reduce((s, c) => s + c.totalSpent, 0);
  const ticketMedio = vendas > 0 ? totalFaturado / vendas : 0;
  const totalVisitas = clients.reduce((s, c) => s + c.visitCount, 0);

  // By unit
  const byUnit = UNITS.map(u => {
    const uc = unitFilter !== 'all' ? clients : clients.filter(c => c.unit === u);
    const uVendas = uc.filter(c => (c.stage || 'entrada') === 'venda').length;
    return { unit: u, total: uc.length, vendas: uVendas, taxa: uc.length > 0 ? ((uVendas / uc.length) * 100).toFixed(1) : '0', faturado: uc.filter(c => (c.stage || 'entrada') === 'venda').reduce((s, c) => s + c.totalSpent, 0) };
  });

  // Top clients by spending
  const topClients = [...clients].sort((a, b) => b.totalSpent - a.totalSpent).slice(0, 10);

  // Monthly new leads (last 6 months)
  const now = new Date();
  const months: { label: string; count: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const label = d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
    const count = clients.filter(c => {
      const cd = new Date(c.createdAt);
      return cd.getMonth() === d.getMonth() && cd.getFullYear() === d.getFullYear();
    }).length;
    months.push({ label, count });
  }
  const maxMonth = Math.max(...months.map(m => m.count), 1);

  // Tags distribution
  const tagCounts: Record<string, number> = {};
  clients.forEach(c => { if (c.tags) c.tags.split(',').forEach(t => { const tag = t.trim(); if (tag) tagCounts[tag] = (tagCounts[tag] || 0) + 1; }); });
  const topTags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 8);

  return (
    <AuthGuard requiredPermission="dashboard">
      <AppHeader activePage="crm-estatistica" />
      <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200" rel="stylesheet" />
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '24px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 28, color: 'var(--primary)' }}>insights</span> CRM — Estatística
            </h1>
            <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: 'var(--text-muted)' }}>Análise completa do funil de vendas</p>
          </div>
          <select value={unitFilter} onChange={e => setUnitFilter(e.target.value)} style={{ ...inputS, minWidth: 160 }}>
            <option value="all">Todas Unidades</option>
            {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>

        {loading ? (
          <div style={{ ...cardS, textAlign: 'center', padding: '60px' }}><span style={{ color: 'var(--text-muted)' }}>Carregando...</span></div>
        ) : (
          <>
            {/* KPI Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 24 }}>
              {[
                { icon: 'groups', color: '#6366f1', label: 'Total Leads', value: String(total) },
                { icon: 'check_circle', color: '#10b981', label: 'Vendas', value: String(vendas) },
                { icon: 'cancel', color: '#ef4444', label: 'Não Vendas', value: String(naoVendas) },
                { icon: 'trending_up', color: '#f59e0b', label: 'Taxa Conversão', value: `${taxaConversao}%` },
                { icon: 'payments', color: '#8b5cf6', label: 'Total Faturado', value: fmt(totalFaturado) },
                { icon: 'receipt', color: '#14b8a6', label: 'Ticket Médio', value: fmt(ticketMedio) },
              ].map(kpi => (
                <div key={kpi.label} style={{ ...cardS, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 42, height: 42, borderRadius: 10, background: `${kpi.color}12`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 22, color: kpi.color }}>{kpi.icon}</span>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' as const }}>{kpi.label}</div>
                    <div style={{ fontSize: '1.2rem', fontWeight: 900 }}>{kpi.value}</div>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
              {/* Funnel Chart */}
              <div style={cardS}>
                <h3 style={{ margin: '0 0 16px', fontSize: '0.95rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--primary)' }}>filter_alt</span> Funil de Vendas
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {byStage.map((s, i) => {
                    const pct = total > 0 ? (s.count / total) * 100 : 0;
                    const width = Math.max(pct, 8);
                    return (
                      <div key={s.key}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span style={{ fontSize: '0.78rem', fontWeight: 700 }}>{s.label}</span>
                          <span style={{ fontSize: '0.78rem', fontWeight: 800, color: s.color }}>{s.count} ({pct.toFixed(0)}%)</span>
                        </div>
                        <div style={{ height: 28, background: 'var(--bg)', borderRadius: 8, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${width}%`, background: `linear-gradient(90deg, ${s.color}, ${s.color}99)`, borderRadius: 8, transition: 'width 0.5s ease', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            {pct > 15 && <span style={{ fontSize: '0.65rem', fontWeight: 800, color: '#fff' }}>{s.count}</span>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Monthly trend */}
              <div style={cardS}>
                <h3 style={{ margin: '0 0 16px', fontSize: '0.95rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#10b981' }}>show_chart</span> Novos Leads / Mês
                </h3>
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', height: 160, padding: '0 10px' }}>
                  {months.map(m => (
                    <div key={m.label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                      <span style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--primary)' }}>{m.count}</span>
                      <div style={{ width: '100%', height: `${(m.count / maxMonth) * 120}px`, minHeight: 4, background: 'linear-gradient(180deg, var(--primary), #ff4db1)', borderRadius: '6px 6px 0 0', transition: 'height 0.5s ease' }} />
                      <span style={{ fontSize: '0.62rem', fontWeight: 600, color: 'var(--text-muted)' }}>{m.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
              {/* Performance by Unit */}
              <div style={cardS}>
                <h3 style={{ margin: '0 0 16px', fontSize: '0.95rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#f59e0b' }}>leaderboard</span> Performance por Unidade
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {byUnit.map(u => (
                    <div key={u.unit} style={{ background: 'var(--bg)', borderRadius: 12, padding: '12px 16px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <span style={{ fontSize: '0.88rem', fontWeight: 800 }}>{u.unit}</span>
                        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#10b981' }}>{u.taxa}% conversão</span>
                      </div>
                      <div style={{ display: 'flex', gap: 16 }}>
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>📊 {u.total} leads</span>
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>✅ {u.vendas} vendas</span>
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>💰 {fmt(u.faturado)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Tags distribution */}
              <div style={cardS}>
                <h3 style={{ margin: '0 0 16px', fontSize: '0.95rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#8b5cf6' }}>label</span> Tags Mais Usadas
                </h3>
                {topTags.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)', fontSize: '0.82rem' }}>Nenhuma tag registrada</div>
                ) : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {topTags.map(([tag, count]) => (
                      <div key={tag} style={{ padding: '8px 14px', borderRadius: 10, background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#8b5cf6' }}>{tag}</span>
                        <span style={{ fontSize: '0.65rem', fontWeight: 800, padding: '1px 6px', borderRadius: 4, background: '#8b5cf6', color: '#fff' }}>{count}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Top clients */}
            <div style={cardS}>
              <h3 style={{ margin: '0 0 16px', fontSize: '0.95rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#e600a0' }}>star</span> Top 10 Clientes por Faturamento
              </h3>
              {topClients.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)', fontSize: '0.82rem' }}>Nenhum dado disponível</div>
              ) : (
                <div style={{ display: 'grid', gap: 6 }}>
                  {topClients.map((c, i) => {
                    const colors = ['#f59e0b', '#94a3b8', '#cd7f32', '#6366f1', '#6366f1', '#6366f1', '#6366f1', '#6366f1', '#6366f1', '#6366f1'];
                    const stg = STAGES.find(s => s.key === (c.stage || 'entrada'));
                    return (
                      <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: 'var(--bg)', borderRadius: 10 }}>
                        <div style={{ width: 28, height: 28, borderRadius: 8, background: i < 3 ? colors[i] : 'var(--card-bg)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '0.72rem', color: i < 3 ? '#fff' : 'var(--text-muted)' }}>
                          {i + 1}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '0.85rem', fontWeight: 800 }}>{c.name}</div>
                          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{c.unit} · {c.visitCount} visitas</div>
                        </div>
                        <div style={{ padding: '3px 8px', borderRadius: 6, background: `${stg?.color || '#6366f1'}14`, color: stg?.color || '#6366f1', fontSize: '0.65rem', fontWeight: 700 }}>
                          {stg?.label || 'Entrada'}
                        </div>
                        <div style={{ fontSize: '0.92rem', fontWeight: 900, color: '#10b981', minWidth: 90, textAlign: 'right' }}>
                          {fmt(c.totalSpent)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Extra stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginTop: 20 }}>
              <div style={{ ...cardS, textAlign: 'center', padding: '20px' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 32, color: '#6366f1', opacity: 0.6 }}>visibility</span>
                <div style={{ fontSize: '1.5rem', fontWeight: 900, marginTop: 6 }}>{totalVisitas}</div>
                <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)' }}>Total de Visitas</div>
              </div>
              <div style={{ ...cardS, textAlign: 'center', padding: '20px' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 32, color: '#10b981', opacity: 0.6 }}>avg_pace</span>
                <div style={{ fontSize: '1.5rem', fontWeight: 900, marginTop: 6 }}>{total > 0 ? (totalVisitas / total).toFixed(1) : '0'}</div>
                <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)' }}>Média Visitas/Lead</div>
              </div>
              <div style={{ ...cardS, textAlign: 'center', padding: '20px' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 32, color: '#f59e0b', opacity: 0.6 }}>monetization_on</span>
                <div style={{ fontSize: '1.5rem', fontWeight: 900, marginTop: 6 }}>{fmt(clients.reduce((s, c) => s + c.totalSpent, 0))}</div>
                <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)' }}>Faturamento Total</div>
              </div>
            </div>
          </>
        )}
      </div>
    </AuthGuard>
  );
}
