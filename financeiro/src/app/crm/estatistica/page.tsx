'use client';
import { useState, useEffect, useCallback } from 'react';
import { useGlobalUnit } from '@/contexts/UnitContext';

interface Client {
  id: string; name: string; phone: string | null; email: string | null;
  unit: string; tags: string | null; totalSpent: number; visitCount: number;
  lastVisit: string | null; stage: string; createdAt: string;
  source?: string | null; campaignName?: string | null;
}

interface SurveyStats {
  totalSurveys: number; totalSent: number; totalAnswered: number;
  responseRate: string; avgRating: string;
  distribution: Record<number, number>;
}
interface SurveyRecent {
  id: string; clientName: string; procedimento: string; profissional: string | null;
  rating: number | null; comment: string | null; status: string; unit: string;
  sentAt: string | null; answeredAt: string | null; createdAt: string;
}

const DEFAULT_STAGES = [
  { key: 'entrada', label: 'Entrada', color: '#6366f1' },
  { key: 'em_andamento', label: 'Em Andamento', color: '#f59e0b' },
  { key: 'avaliacao', label: 'Avaliação', color: '#8b5cf6' },
  { key: 'venda', label: 'Venda', color: '#10b981' },
  { key: 'nao_venda', label: 'Não Venda', color: '#ef4444' },
];
const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

// Mobile-first card style — compact padding
const cardS: React.CSSProperties = {
  background: 'var(--card-bg)', borderRadius: 18, border: '1px solid var(--border)',
  boxShadow: 'var(--shadow-sm)', padding: '16px 14px',
};

// Star rating display
const StarRating = ({ rating, size = 16 }: { rating: number; size?: number }) => {
  const stars = [];
  for (let i = 1; i <= 5; i++) {
    stars.push(
      <span key={i} style={{ fontSize: size, color: i <= rating ? '#f59e0b' : 'var(--border)' }}>
        ★
      </span>
    );
  }
  return <span style={{ display: 'inline-flex', gap: 1 }}>{stars}</span>;
};

const ratingColor = (r: number) => r >= 4 ? '#10b981' : r === 3 ? '#f59e0b' : '#ef4444';

export default function CrmEstatisticaPage() {
  const { units: UNITS, globalUnit } = useGlobalUnit();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  // Survey stats
  const [surveyStats, setSurveyStats] = useState<SurveyStats | null>(null);
  const [surveyRecent, setSurveyRecent] = useState<SurveyRecent[]>([]);
  const [surveyLoading, setSurveyLoading] = useState(true);
  const [stages, setStages] = useState(DEFAULT_STAGES);
  const [viewAsUnit, setViewAsUnit] = useState('');
  
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().split('T')[0];
  });

  useEffect(() => {
    const saved = localStorage.getItem('virtuosa_crm_stages');
    if (saved) {
      try { setStages(JSON.parse(saved)); } catch (e) { console.error(e); }
    }
  }, []);

  // Restore admin "view as" unit from CRM dashboard
  useEffect(() => {
    try {
      const raw = localStorage.getItem('virtuosa_user');
      const user = raw ? JSON.parse(raw) : null;
      const isAdm = user?.role === 'ADMINISTRADOR' || user?.permissions?.admin === true;
      if (!isAdm) return;
      const saved = localStorage.getItem('crm_view_as');
      if (!saved) return;
      const va = JSON.parse(saved);
      if (va.unit) setViewAsUnit(va.unit);
    } catch {}
  }, []);

  const fetchClients = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '1000' });
      const effectiveUnit = viewAsUnit || globalUnit;
      if (effectiveUnit) params.set('unit', effectiveUnit);
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);
      const res = await fetch(`/api/clients?${params}`);
      const data = await res.json();
      setClients(data.clients || []);
    } catch { setClients([]); }
    finally { setLoading(false); }
  }, [globalUnit, viewAsUnit, startDate, endDate]);

  const fetchSurveys = useCallback(async () => {
    setSurveyLoading(true);
    try {
      const params = new URLSearchParams();
      const effectiveUnit = viewAsUnit || globalUnit;
      if (effectiveUnit) params.set('unit', effectiveUnit);
      const res = await fetch(`/api/surveys?${params}`);
      const data = await res.json();
      setSurveyStats(data.stats || null);
      setSurveyRecent(data.recent || []);
    } catch {
      setSurveyStats(null);
      setSurveyRecent([]);
    }
    finally { setSurveyLoading(false); }
  }, [globalUnit, viewAsUnit]);

  useEffect(() => { fetchClients(); fetchSurveys(); }, [fetchClients, fetchSurveys]);

  // Stats
  const total = clients.length;
  const byStage = stages.map(s => ({ ...s, count: clients.filter(c => (c.stage || 'entrada') === s.key).length }));
  const vendas = byStage.find(s => s.key === 'venda')?.count || 0;
  const naoVendas = byStage.find(s => s.key === 'nao_venda')?.count || 0;
  const taxaConversao = total > 0 ? ((vendas / total) * 100).toFixed(1) : '0';
  const totalFaturado = clients.filter(c => (c.stage || 'entrada') === 'venda').reduce((s, c) => s + c.totalSpent, 0);
  const ticketMedio = vendas > 0 ? totalFaturado / vendas : 0;
  const totalVisitas = clients.reduce((s, c) => s + c.visitCount, 0);

  // By unit
  const byUnit = UNITS.map(u => {
    const uc = clients.filter(c => c.unit === u);
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
    const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    const label = `${monthNames[d.getMonth()]}/${String(d.getFullYear()).slice(-2)}`;
    const count = clients.filter(c => {
      const cd = new Date(c.createdAt);
      return cd.getMonth() === d.getMonth() && cd.getFullYear() === d.getFullYear();
    }).length;
    months.push({ label, count });
  }
  const maxMonth = Math.max(...months.map(m => m.count), 1);

  // Meta Ads Campaigns
  const metaAdsClients = clients.filter(c => c.source === 'facebook_ad' || !!c.campaignName);
  const campaignsMap: Record<string, { leads: number, vendas: number, faturado: number }> = {};
  metaAdsClients.forEach(c => {
    const campaign = c.campaignName || 'Desconhecida (Anúncio)';
    if (!campaignsMap[campaign]) campaignsMap[campaign] = { leads: 0, vendas: 0, faturado: 0 };
    campaignsMap[campaign].leads += 1;
    if ((c.stage || 'entrada') === 'venda') {
      campaignsMap[campaign].vendas += 1;
      campaignsMap[campaign].faturado += (c.totalSpent || 0);
    }
  });
  const topCampaigns = Object.entries(campaignsMap).map(([name, stats]) => ({ name, ...stats })).sort((a, b) => b.leads - a.leads);

  // Tags distribution
  const tagCounts: Record<string, number> = {};
  clients.forEach(c => { if (c.tags) c.tags.split(',').forEach(t => { const tag = t.trim(); if (tag) tagCounts[tag] = (tagCounts[tag] || 0) + 1; }); });
  const topTags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 8);

  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200" rel="stylesheet" />
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '12px 14px 32px' }}>

        {/* ── Header & Filtros ── */}
        <div style={{ marginBottom: 16, display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 22, color: 'var(--primary)', flexShrink: 0 }}>insights</span>
              CRM — Estatística
            </h1>
            <p style={{ margin: '3px 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>Análise completa do funil de vendas</p>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', background: 'var(--card-bg)', padding: '6px 10px', borderRadius: 10, border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)' }}>De:</span>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={{ background: 'transparent', border: 'none', color: 'var(--text)', fontSize: '0.8rem', fontWeight: 600, outline: 'none', cursor: 'pointer' }} />
            </div>
            <div style={{ width: 1, height: 16, background: 'var(--border)' }}></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)' }}>Até:</span>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} style={{ background: 'transparent', border: 'none', color: 'var(--text)', fontSize: '0.8rem', fontWeight: 600, outline: 'none', cursor: 'pointer' }} />
            </div>
          </div>
        </div>

        {loading ? (
          <div style={{ ...cardS, textAlign: 'center', padding: '60px' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 36, color: 'var(--text-muted)', opacity: 0.5 }}>progress_activity</span>
            <p style={{ color: 'var(--text-muted)', marginTop: 8, fontSize: '0.85rem' }}>Carregando...</p>
          </div>
        ) : (
          <>
            {/* ── KPI Cards — 2 colunas em mobile ── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))', gap: 10, marginBottom: 14 }}>
              {[
                { icon: 'groups', color: '#6366f1', label: 'Total Leads', value: String(total) },
                { icon: 'check_circle', color: '#10b981', label: 'Vendas', value: String(vendas) },
                { icon: 'cancel', color: '#ef4444', label: 'Não Vendas', value: String(naoVendas) },
                { icon: 'trending_up', color: '#f59e0b', label: 'Taxa Conversão', value: `${taxaConversao}%` },
                { icon: 'payments', color: '#8b5cf6', label: 'Total Faturado', value: fmt(totalFaturado) },
                { icon: 'receipt', color: '#14b8a6', label: 'Ticket Médio', value: fmt(ticketMedio) },
              ].map(kpi => (
                <div key={kpi.label} style={{ ...cardS, padding: '12px', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 34, height: 34, borderRadius: 9, background: `${kpi.color}12`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 18, color: kpi.color }}>{kpi.icon}</span>
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '0.58rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.3px', whiteSpace: 'nowrap' }}>{kpi.label}</div>
                    <div style={{ fontSize: '1rem', fontWeight: 900, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{kpi.value}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* ── Funil + Gráfico — 1 coluna em mobile ── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12, marginBottom: 12 }}>
              {/* Funnel Chart */}
              <div style={cardS}>
                <h3 style={{ margin: '0 0 14px', fontSize: '0.9rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--primary)' }}>filter_alt</span>
                  Funil de Vendas
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {byStage.map(s => {
                    const pct = total > 0 ? (s.count / total) * 100 : 0;
                    const width = Math.max(pct, 8);
                    return (
                      <div key={s.key}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                          <span style={{ fontSize: '0.78rem', fontWeight: 700 }}>{s.label}</span>
                          <span style={{ fontSize: '0.75rem', fontWeight: 800, color: s.color }}>{s.count} ({pct.toFixed(0)}%)</span>
                        </div>
                        <div style={{ height: 24, background: 'var(--bg)', borderRadius: 7, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${width}%`, background: `linear-gradient(90deg, ${s.color}, ${s.color}99)`, borderRadius: 7, transition: 'width 0.5s ease', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            {pct > 15 && <span style={{ fontSize: '0.62rem', fontWeight: 800, color: '#fff' }}>{s.count}</span>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Monthly trend */}
              <div style={cardS}>
                <h3 style={{ margin: '0 0 14px', fontSize: '0.9rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#10b981' }}>show_chart</span>
                  Novos Leads / Mês
                </h3>
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', height: 140, padding: '0 4px' }}>
                  {months.map(m => (
                    <div key={m.label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                      <span style={{ fontSize: '0.68rem', fontWeight: 800, color: 'var(--primary)' }}>{m.count}</span>
                      <div style={{ width: '100%', height: `${(m.count / maxMonth) * 100}px`, minHeight: 4, background: 'linear-gradient(180deg, var(--primary), #ff4db1)', borderRadius: '5px 5px 0 0', transition: 'height 0.5s ease' }} />
                      <span style={{ fontSize: '0.58rem', fontWeight: 600, color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.2 }}>{m.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* ── Avaliações de Atendimento — Link para página dedicada ── */}
            <div style={{ marginBottom: 12 }}>
              <a href="/crm/avaliacoes" style={{ textDecoration: 'none', color: 'inherit' }}>
                <div style={{ ...cardS, display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', transition: 'border-color 0.15s', border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(245,158,11,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 22, color: '#f59e0b' }}>reviews</span>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.92rem', fontWeight: 800 }}>Avaliações de Atendimento</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>
                        {surveyLoading ? 'Carregando...' : !surveyStats || surveyStats.totalSurveys === 0 ? 'Nenhuma avaliação ainda' : `${surveyStats.totalAnswered} respondida${surveyStats.totalAnswered !== 1 ? 's' : ''} · Nota média: ${surveyStats.avgRating} ★`}
                      </div>
                    </div>
                  </div>
                  <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--text-muted)' }}>arrow_forward</span>
                </div>
              </a>
            </div>

            {/* ── Performance + Tags — 1 coluna em mobile ── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12, marginBottom: 12 }}>
              {/* Performance by Unit */}
              <div style={cardS}>
                <h3 style={{ margin: '0 0 12px', fontSize: '0.9rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#f59e0b' }}>leaderboard</span>
                  Performance por Unidade
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {byUnit.map(u => (
                    <div key={u.unit} style={{ background: 'var(--bg)', borderRadius: 10, padding: '10px 12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <span style={{ fontSize: '0.85rem', fontWeight: 800 }}>{u.unit}</span>
                        <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#10b981' }}>{u.taxa}% conv.</span>
                      </div>
                      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>📊 {u.total} leads</span>
                        <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>✅ {u.vendas}</span>
                        <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>💰 {fmt(u.faturado)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Tags distribution */}
              <div style={cardS}>
                <h3 style={{ margin: '0 0 12px', fontSize: '0.9rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#8b5cf6' }}>label</span>
                  Tags Mais Usadas
                </h3>
                {topTags.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-muted)', fontSize: '0.82rem' }}>Nenhuma tag registrada</div>
                ) : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                    {topTags.map(([tag, count]) => (
                      <div key={tag} style={{ padding: '6px 12px', borderRadius: 9, background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)', display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#8b5cf6' }}>{tag}</span>
                        <span style={{ fontSize: '0.62rem', fontWeight: 800, padding: '1px 5px', borderRadius: 4, background: '#8b5cf6', color: '#fff' }}>{count}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* ── Meta Ads Campaigns ── */}
            <div style={{ ...cardS, marginBottom: 12 }}>
              <h3 style={{ margin: '0 0 12px', fontSize: '0.9rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: 7 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#3b82f6' }}>campaign</span>
                Performance de Campanhas (Meta Ads)
              </h3>
              {topCampaigns.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-muted)', fontSize: '0.82rem' }}>Nenhuma campanha de anúncio registrada no período</div>
              ) : (
                <div style={{ display: 'grid', gap: 6 }}>
                  {topCampaigns.map((c, i) => {
                    const convRate = c.leads > 0 ? ((c.vendas / c.leads) * 100).toFixed(1) : '0';
                    return (
                      <div key={c.name} style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 10, padding: '10px 12px', background: 'var(--bg)', borderRadius: 10 }}>
                        <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                          <div style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--text)', marginBottom: 2 }}>{c.name}</div>
                          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                            <span style={{ fontWeight: 700, color: '#6366f1' }}>{c.leads}</span> leads gerados
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                            <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.5px' }}>Vendas</span>
                            <span style={{ fontSize: '0.85rem', fontWeight: 900, color: '#10b981' }}>{c.vendas}</span>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                            <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.5px' }}>Conversão</span>
                            <span style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--text)' }}>{convRate}%</span>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', minWidth: 80 }}>
                            <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.5px' }}>Receita</span>
                            <span style={{ fontSize: '0.9rem', fontWeight: 900, color: '#3b82f6' }}>{fmt(c.faturado)}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ── Top Clients ── */}
            <div style={{ ...cardS, marginBottom: 12 }}>
              <h3 style={{ margin: '0 0 12px', fontSize: '0.9rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: 7 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#e600a0' }}>star</span>
                Top 10 Clientes por Faturamento
              </h3>
              {topClients.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-muted)', fontSize: '0.82rem' }}>Nenhum dado disponível</div>
              ) : (
                <div style={{ display: 'grid', gap: 6 }}>
                  {topClients.map((c, i) => {
                    const podiumColors = ['#f59e0b', '#94a3b8', '#cd7f32'];
                    const stg = stages.find(s => s.key === (c.stage || 'entrada'));
                    return (
                      <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', background: 'var(--bg)', borderRadius: 10 }}>
                        <div style={{ width: 26, height: 26, borderRadius: 7, background: i < 3 ? podiumColors[i] : 'var(--card-bg)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '0.7rem', color: i < 3 ? '#fff' : 'var(--text-muted)', flexShrink: 0 }}>
                          {i + 1}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '0.83rem', fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</div>
                          <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{c.unit} · {c.visitCount} visita{c.visitCount !== 1 ? 's' : ''}</div>
                        </div>
                        <span style={{ padding: '2px 7px', borderRadius: 5, background: `${stg?.color || '#6366f1'}14`, color: stg?.color || '#6366f1', fontSize: '0.6rem', fontWeight: 700, flexShrink: 0 }}>
                          {stg?.label || 'Entrada'}
                        </span>
                        <div style={{ fontSize: '0.88rem', fontWeight: 900, color: '#10b981', minWidth: 80, textAlign: 'right', flexShrink: 0 }}>
                          {fmt(c.totalSpent)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ── Leads do Período ── */}
            <div style={{ ...cardS, marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#8b5cf6' }}>person_add</span>
                  Leads do Período ({clients.length})
                </h3>
              </div>
              {clients.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-muted)', fontSize: '0.82rem' }}>Nenhum lead encontrado neste período</div>
              ) : (
                <div style={{ display: 'grid', gap: 6, maxHeight: '400px', overflowY: 'auto', paddingRight: 4 }}>
                  {clients.slice().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).map(c => {
                    const date = new Date(c.createdAt);
                    const isAds = c.source === 'facebook_ad' || !!c.campaignName;
                    return (
                      <div key={c.id} style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 10, padding: '10px 12px', background: 'var(--bg)', borderRadius: 10 }}>
                        <div style={{ flex: '1 1 150px', minWidth: 0 }}>
                          <div style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 12, color: 'var(--text-muted)' }}>call</span>
                            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{c.phone || 'Sem telefone'}</span>
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '0.65rem', fontWeight: 800, padding: '2px 6px', borderRadius: 4, background: isAds ? '#3b82f620' : 'var(--card-bg)', color: isAds ? '#3b82f6' : 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                            {isAds && <span className="material-symbols-outlined" style={{ fontSize: 11 }}>campaign</span>}
                            {isAds ? (c.campaignName || 'Meta Ads') : (c.source || 'WhatsApp')}
                          </span>
                          <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)', background: 'var(--card-bg)', padding: '2px 6px', borderRadius: 4 }}>
                            {c.unit}
                          </span>
                          <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)', minWidth: 70, textAlign: 'right' }}>
                            {date.toLocaleDateString('pt-BR')} {date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ── Extra stats — auto-fit ── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 }}>
              <div style={{ ...cardS, textAlign: 'center', padding: '16px 12px' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 28, color: '#6366f1', opacity: 0.6 }}>visibility</span>
                <div style={{ fontSize: '1.3rem', fontWeight: 900, marginTop: 4 }}>{totalVisitas}</div>
                <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.3px' }}>Total Visitas</div>
              </div>
              <div style={{ ...cardS, textAlign: 'center', padding: '16px 12px' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 28, color: '#10b981', opacity: 0.6 }}>avg_pace</span>
                <div style={{ fontSize: '1.3rem', fontWeight: 900, marginTop: 4 }}>{total > 0 ? (totalVisitas / total).toFixed(1) : '0'}</div>
                <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.3px' }}>Média Visitas/Lead</div>
              </div>
              <div style={{ ...cardS, textAlign: 'center', padding: '16px 12px' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 28, color: '#f59e0b', opacity: 0.6 }}>monetization_on</span>
                <div style={{ fontSize: '1.1rem', fontWeight: 900, marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fmt(clients.reduce((s, c) => s + c.totalSpent, 0))}</div>
                <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.3px' }}>Faturamento Total</div>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
