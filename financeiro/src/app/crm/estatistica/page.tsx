'use client';
import { useState, useEffect, useCallback } from 'react';
import { useGlobalUnit } from '@/contexts/UnitContext';
import { DatePicker } from '@/components/ui/date-picker';

interface Client {
  id: string; name: string; phone: string | null; email: string | null;
  conversationId?: string;
  unit: string; tags: string | null; totalSpent: number; visitCount: number;
  lastVisit: string | null; stage: string; createdAt: string; arrivedAt?: string | null;
  source?: string | null; campaignName?: string | null; fbclid?: string | null;
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
const leadDate = (client: Pick<Client, 'arrivedAt' | 'createdAt'>) => new Date(client.arrivedAt || client.createdAt);
const isGenericCampaign = (value?: string | null) => {
  const normalized = (value || '').trim().toLowerCase();
  return !normalized || normalized === 'converse conosco' || normalized === 'desconhecido' || normalized.startsWith('campanha desconhecida');
};

export default function CrmEstatisticaPage() {
  const { units: UNITS, globalUnit } = useGlobalUnit();
  const [ctwaLeads, setCtwaLeads] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  // Survey stats
  const [surveyStats, setSurveyStats] = useState<SurveyStats | null>(null);
  const [surveyRecent, setSurveyRecent] = useState<SurveyRecent[]>([]);
  const [surveyLoading, setSurveyLoading] = useState(true);
  const [stages, setStages] = useState(DEFAULT_STAGES);
  
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().split('T')[0];
  });
  // Filtro opcional de horário (precisão além do dia)
  const [startTime, setStartTime] = useState('00:00');
  const [endTime, setEndTime] = useState('23:59');
  const [showTime, setShowTime] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('virtuosa_crm_stages');
    if (saved) {
      try { setStages(JSON.parse(saved)); } catch (e) { console.error(e); }
    }

  }, []);

  const fetchClients = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '1000' });
      if (globalUnit) params.set('unit', globalUnit);
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);

      const ctwaRes = await fetch(`/api/crm/estatistica/ctwa?${params}`);
      const ctwaData = await ctwaRes.json();
      setCtwaLeads(ctwaData.leads || []);
    } catch {
      setCtwaLeads([]);
    }
    finally { setLoading(false); }
  }, [globalUnit, startDate, endDate]);

  const fetchSurveys = useCallback(async () => {
    setSurveyLoading(true);
    try {
      const params = new URLSearchParams();
      if (globalUnit) params.set('unit', globalUnit);
      const res = await fetch(`/api/surveys?${params}`);
      const data = await res.json();
      setSurveyStats(data.stats || null);
      setSurveyRecent(data.recent || []);
    } catch {
      setSurveyStats(null);
      setSurveyRecent([]);
    }
    finally { setSurveyLoading(false); }
  }, [globalUnit]);

  useEffect(() => { fetchClients(); fetchSurveys(); }, [fetchClients, fetchSurveys]);

  // Refina por horário (client-side) sobre os leads já filtrados por data no servidor
  const leads = showTime
    ? ctwaLeads.filter(c => {
        const d = leadDate(c);
        const from = new Date(`${startDate}T${startTime}:00`);
        const to = new Date(`${endDate}T${endTime}:59`);
        return d >= from && d <= to;
      })
    : ctwaLeads;

  // Stats
  const total = leads.length;
  const byStage = stages.map(s => ({ ...s, count: leads.filter(c => (c.stage || 'entrada') === s.key).length }));
  const vendas = byStage.find(s => s.key === 'venda')?.count || 0;
  const naoVendas = byStage.find(s => s.key === 'nao_venda')?.count || 0;
  const taxaConversao = total > 0 ? ((vendas / total) * 100).toFixed(1) : '0';
  const totalFaturado = leads.filter(c => (c.stage || 'entrada') === 'venda').reduce((s, c) => s + c.totalSpent, 0);
  const ticketMedio = vendas > 0 ? totalFaturado / vendas : 0;
  const totalVisitas = leads.reduce((s, c) => s + c.visitCount, 0);

  // By unit
  const visibleUnits = globalUnit ? [globalUnit] : UNITS.filter(Boolean);
  const byUnit = visibleUnits.map(u => {
    const uc = leads.filter(c => c.unit === u);
    const uVendas = uc.filter(c => (c.stage || 'entrada') === 'venda').length;
    return { unit: u, total: uc.length, vendas: uVendas, taxa: uc.length > 0 ? ((uVendas / uc.length) * 100).toFixed(1) : '0', faturado: uc.filter(c => (c.stage || 'entrada') === 'venda').reduce((s, c) => s + c.totalSpent, 0) };
  });

  // Top clients by spending
  const topClients = [...leads].sort((a, b) => b.totalSpent - a.totalSpent).slice(0, 10);

  // Monthly new leads (last 6 months)
  const now = new Date();
  const months: { label: string; count: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    const label = `${monthNames[d.getMonth()]}/${String(d.getFullYear()).slice(-2)}`;
    const count = leads.filter(c => {
      const cd = leadDate(c);
      return cd.getMonth() === d.getMonth() && cd.getFullYear() === d.getFullYear();
    }).length;
    months.push({ label, count });
  }
  const maxMonth = Math.max(...months.map(m => m.count), 1);

  // Meta Ads Campaigns — somente leads reais de Click-to-WhatsApp no período.
  const campaignMap: Record<string, { leads: number; vendas: number; faturado: number }> = {};
  leads.forEach(c => {
    const name = isGenericCampaign(c.campaignName) ? 'Sem campanha classificada' : c.campaignName!;
    if (!campaignMap[name]) campaignMap[name] = { leads: 0, vendas: 0, faturado: 0 };
    campaignMap[name].leads += 1;
    if ((c.stage || 'entrada') === 'venda') {
      campaignMap[name].vendas += 1;
      campaignMap[name].faturado += c.totalSpent || 0;
    }
  });
  const topCampaigns = Object.entries(campaignMap)
    .map(([name, stats]) => ({ name, ...stats }))
    .sort((a, b) => b.leads - a.leads);
  const maxCampaignLeads = Math.max(...topCampaigns.map(c => c.leads), 1);

  // Tags distribution
  const tagCounts: Record<string, number> = {};
  leads.forEach(c => { if (c.tags) c.tags.split(',').forEach(t => { const tag = t.trim(); if (tag) tagCounts[tag] = (tagCounts[tag] || 0) + 1; }); });
  const topTags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 8);

  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200" rel="stylesheet" />
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '12px 14px 32px' }}>

        {/* ── Header & Filtros ── */}
        <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
          <p className="m-0 text-[0.88rem] font-medium text-muted-foreground">
            Análise completa do funil de vendas
          </p>
          <div className="flex flex-wrap items-end gap-4 rounded-xl border border-border/50 bg-card p-3 shadow-sm">
            <div className="min-w-[140px]">
              <label className="mb-1 flex items-center gap-1.5 text-[0.65rem] font-bold uppercase tracking-wider text-muted-foreground/80">
                <span className="material-symbols-outlined text-[14px]">date_range</span>
                Período Inicial
              </label>
              <DatePicker value={startDate} onChange={setStartDate} variant="compact" calendarSize="small" placeholder="Data inicial" />
              {showTime && (
                <input
                  type="time"
                  value={startTime}
                  onChange={e => setStartTime(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-primary/60 bg-background px-2 py-1 text-[0.78rem] text-foreground outline-none"
                />
              )}
            </div>
            <div className="min-w-[140px]">
              <label className="mb-1 flex items-center gap-1.5 text-[0.65rem] font-bold uppercase tracking-wider text-muted-foreground/80">
                <span className="material-symbols-outlined text-[14px]">event</span>
                Período Final
              </label>
              <DatePicker value={endDate} onChange={setEndDate} variant="compact" calendarSize="small" placeholder="Data final" />
              {showTime && (
                <input
                  type="time"
                  value={endTime}
                  onChange={e => setEndTime(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-primary/60 bg-background px-2 py-1 text-[0.78rem] text-foreground outline-none"
                />
              )}
            </div>
            <button
              onClick={() => setShowTime(v => !v)}
              title={showTime ? 'Desativar filtro por horário' : 'Ativar filtro por horário'}
              className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[0.68rem] font-bold transition-colors ${
                showTime
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border/60 bg-transparent text-muted-foreground hover:border-border'
              }`}
            >
              <span className="material-symbols-outlined text-[14px]">schedule</span>
              Horário
            </button>
          </div>
        </div>

        {loading ? (
          <div className="rounded-xl border border-border/50 bg-card p-[60px] text-center shadow-sm">
            <span className="material-symbols-outlined" style={{ fontSize: 36, color: 'var(--text-muted)', opacity: 0.5 }}>progress_activity</span>
            <p style={{ color: 'var(--text-muted)', marginTop: 8, fontSize: '0.85rem' }}>Carregando...</p>
          </div>
        ) : (
          <>
            {/* ── KPI Cards — 2 colunas em mobile ── */}
            <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              {[
                { icon: 'groups', color: '#6366f1', label: 'Leads CTWA', value: String(total) },
                { icon: 'check_circle', color: '#10b981', label: 'Vendas', value: String(vendas) },
                { icon: 'cancel', color: '#ef4444', label: 'Não Vendas', value: String(naoVendas) },
                { icon: 'trending_up', color: '#f59e0b', label: 'Taxa Conversão', value: `${taxaConversao}%` },
                { icon: 'payments', color: '#8b5cf6', label: 'Total Faturado', value: fmt(totalFaturado) },
                { icon: 'receipt', color: '#14b8a6', label: 'Ticket Médio', value: fmt(ticketMedio) },
              ].map(kpi => (
                <div key={kpi.label} className="flex flex-col justify-center rounded-xl border border-border/50 bg-card p-4 transition-all hover:shadow-md">
                  <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80">
                    <div className="flex items-center justify-center rounded-md p-1.5" style={{ background: `${kpi.color}15` }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 16, color: kpi.color }}>{kpi.icon}</span>
                    </div>
                    <span>{kpi.label}</span>
                  </div>
                  <div className="mt-1 truncate text-[1.1rem] font-bold text-foreground" title={kpi.value}>{kpi.value}</div>
                </div>
              ))}
            </div>

            {/* ── Campanhas + Gráfico — 1 coluna em mobile ── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12, marginBottom: 12 }}>
              {/* Campaign chart */}
              <div className="rounded-xl border border-border/50 bg-card p-4 shadow-sm">
                <h3 style={{ margin: '0 0 14px', fontSize: '0.9rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#3b82f6' }}>campaign</span>
                  Performance por Campanha
                </h3>
                {topCampaigns.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                    Nenhum lead Click-to-WhatsApp registrado no período
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                    {topCampaigns.slice(0, 8).map((c, i) => {
                      const pct = total > 0 ? (c.leads / total) * 100 : 0;
                      const width = Math.max((c.leads / maxCampaignLeads) * 100, 8);
                      const colors = ['#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#14b8a6', '#ef4444', '#6366f1'];
                      const color = colors[i % colors.length];
                      return (
                        <div key={c.name}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 3 }}>
                            <span style={{ fontSize: '0.78rem', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                            <span style={{ fontSize: '0.75rem', fontWeight: 800, color }}>{c.leads} ({pct.toFixed(0)}%)</span>
                          </div>
                          <div style={{ height: 24, background: 'var(--bg)', borderRadius: 7, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${width}%`, background: `linear-gradient(90deg, ${color}, ${color}99)`, borderRadius: 7, transition: 'width 0.5s ease', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              {width > 18 && <span style={{ fontSize: '0.62rem', fontWeight: 800, color: '#fff' }}>{c.leads}</span>}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Monthly trend */}
              <div className="rounded-xl border border-border/50 bg-card p-4 shadow-sm">
                <h3 style={{ margin: '0 0 14px', fontSize: '0.9rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#10b981' }}>show_chart</span>
                  Novos Leads CTWA / Mês
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
                <div className="flex items-center justify-between cursor-pointer transition-colors border border-border/50 hover:border-border rounded-xl bg-card p-4 shadow-sm">
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
              <div className="rounded-xl border border-border/50 bg-card p-4 shadow-sm">
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
              <div className="rounded-xl border border-border/50 bg-card p-4 shadow-sm">
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
            <div className="rounded-xl border border-border/50 bg-card p-4 shadow-sm mb-3">
              <h3 style={{ margin: '0 0 12px', fontSize: '0.9rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: 7 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#3b82f6' }}>campaign</span>
                Performance de Campanhas (Meta Ads)
              </h3>
              {topCampaigns.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                  Nenhuma campanha de anúncio registrada no período
                </div>
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

            {/* ── Funil de Vendas ── */}
            <div className="rounded-xl border border-border/50 bg-card p-4 shadow-sm mb-3">
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

            {/* ── Top Clients ── */}
            <div className="rounded-xl border border-border/50 bg-card p-4 shadow-sm mb-3">
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
                      <div key={c.id} className="flex items-center gap-3 rounded-lg border border-border/50 bg-background p-3 shadow-sm transition-all hover:bg-muted/30">
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
            <div className="rounded-xl border border-border/50 bg-card p-4 shadow-sm mb-3">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#8b5cf6' }}>person_add</span>
                  Leads CTWA do Período ({leads.length})
                </h3>
              </div>
              {leads.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-muted)', fontSize: '0.82rem' }}>Nenhum lead Click-to-WhatsApp encontrado neste período</div>
              ) : (
                <div style={{ display: 'grid', gap: 6, maxHeight: '400px', overflowY: 'auto', paddingRight: 4 }}>
                  {leads.slice().sort((a, b) => leadDate(b).getTime() - leadDate(a).getTime()).map(c => {
                    const date = leadDate(c);
                    const isAds = c.source === 'facebook_ad' || !!c.campaignName;
                    return (
                      <div key={c.conversationId || c.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-border/50 bg-background p-3 shadow-sm transition-all hover:bg-muted/30">
                        <div className="flex min-w-0 flex-1 flex-col">
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: c.source === 'facebook_ad' ? '#3b82f6' : '#10b981' }} />
                            <div className="truncate text-[0.85rem] font-bold text-foreground">{c.name}</div>
                          </div>
                          <div className="mt-1 flex items-center gap-1">
                            <span className="material-symbols-outlined text-[12px] text-muted-foreground">call</span>
                            <span className="text-[0.7rem] text-muted-foreground">{c.phone || 'Sem telefone'}</span>
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
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              <div className="flex flex-col items-center justify-center rounded-xl border border-border/50 bg-card p-4 text-center transition-all hover:shadow-md">
                <span className="material-symbols-outlined mb-2 text-[24px] text-[#6366f1] opacity-80">visibility</span>
                <div className="text-[1.1rem] font-bold text-foreground">{totalVisitas}</div>
                <div className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80">Total Visitas</div>
              </div>
              <div className="flex flex-col items-center justify-center rounded-xl border border-border/50 bg-card p-4 text-center transition-all hover:shadow-md">
                <span className="material-symbols-outlined mb-2 text-[24px] text-[#10b981] opacity-80">avg_pace</span>
                <div className="text-[1.1rem] font-bold text-foreground">{total > 0 ? (totalVisitas / total).toFixed(1) : '0'}</div>
                <div className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80">Média Visitas/Lead</div>
              </div>
              <div className="flex flex-col items-center justify-center rounded-xl border border-border/50 bg-card p-4 text-center transition-all hover:shadow-md">
                <span className="material-symbols-outlined mb-2 text-[24px] text-[#f59e0b] opacity-80">monetization_on</span>
                <div className="text-[1.1rem] font-bold text-foreground truncate w-full">{fmt(leads.reduce((s, c) => s + c.totalSpent, 0))}</div>
                <div className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80">Faturamento Total</div>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
