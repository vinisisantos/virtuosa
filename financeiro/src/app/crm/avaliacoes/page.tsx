'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { toast } from '@/components/toast';
import { useGlobalUnit } from '@/contexts/UnitContext';
import AuthGuard from '@/components/auth-guard';

interface SurveyStats {
  totalSurveys: number;
  totalSent: number;
  totalAnswered: number;
  responseRate: string;
  avgRating: string;
  distribution: Record<number, number>;
}

interface SurveyItem {
  id: string;
  clientName: string;
  procedimento: string;
  profissional: string | null;
  rating: number | null;
  comment: string | null;
  status: string;
  unit: string;
  sentAt: string | null;
  answeredAt: string | null;
  createdAt: string;
}

interface ProfData { total: number; sum: number; avg: number; }

export default function AvaliacoesPage() {
  const { globalUnit, units = [] } = useGlobalUnit();
  const [selectedUnit, setSelectedUnit] = useState(globalUnit || 'Todas');
  const [selectedProfissional, setSelectedProfissional] = useState('all');
  const [allProfissionais, setAllProfissionais] = useState<string[]>([]);
  const [rawStats, setRawStats] = useState<SurveyStats | null>(null);
  const [rawRecent, setRawRecent] = useState<SurveyItem[]>([]);
  const [byProfissional, setByProfissional] = useState<Record<string, ProfData>>({});
  const [byProcedimento, setByProcedimento] = useState<Record<string, ProfData>>({});
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('30d');
  const [tab, setTab] = useState<'overview' | 'profissionais' | 'procedimentos' | 'recentes'>('overview');

  // Sincroniza a unidade selecionada localmente caso a unidade global seja trocada no cabeçalho
  useEffect(() => {
    if (globalUnit) {
      setSelectedUnit(globalUnit);
    }
  }, [globalUnit]);

  // Restore admin "view as" selection from CRM dashboard (runs after globalUnit sync)
  useEffect(() => {
    try {
      const raw = localStorage.getItem('virtuosa_user');
      const user = raw ? JSON.parse(raw) : null;
      const isAdm = user?.role === 'ADMINISTRADOR' || user?.permissions?.admin === true;
      if (!isAdm) return;
      const saved = localStorage.getItem('crm_view_as');
      if (!saved) return;
      const va = JSON.parse(saved);
      if (va.unit) setSelectedUnit(va.unit);
      if (va.userName) setSelectedProfissional(va.userName);
    } catch {}
  }, []);

  // Busca todos os usuários do sistema e filtra pela unidade selecionada (ativos)
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const res = await fetch('/api/users');
        const data = await res.json();
        if (Array.isArray(data)) {
          const filtered = data
            .filter((u: any) => u.isActive && (selectedUnit === 'Todas' || u.unit === selectedUnit))
            .map((u: any) => u.name)
            .sort();
          setAllProfissionais(filtered);
        }
      } catch (err) {
        console.error('Erro ao buscar usuários da unidade:', err);
      }
    };
    fetchUsers();
  }, [selectedUnit]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const now = new Date();
      let from = '';
      if (period === '7d') from = new Date(now.getTime() - 7 * 86400000).toISOString();
      else if (period === '30d') from = new Date(now.getTime() - 30 * 86400000).toISOString();
      else if (period === '90d') from = new Date(now.getTime() - 90 * 86400000).toISOString();

      const params = new URLSearchParams();
      if (selectedUnit && selectedUnit !== 'Todas') params.set('unit', selectedUnit);
      if (from) params.set('from', from);

      const res = await fetch(`/api/surveys?${params.toString()}`);
      const data = await res.json();

      setRawStats(data.stats);
      setRawRecent(data.recent || []);
      setByProfissional(data.byProfissional || {});
      setByProcedimento(data.byProcedimento || {});
    } catch {
      toast('Erro ao carregar avaliações', 'error');
    }
    setLoading(false);
  }, [selectedUnit, period]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Lista unificada e ordenada contendo todos os profissionais cadastrados na unidade + aqueles que têm avaliações
  const profissionaisList = useMemo(() => {
    const fromApi = allProfissionais;
    const fromSurveys = Object.keys(byProfissional);
    const combined = Array.from(new Set([...fromApi, ...fromSurveys]));
    return combined.sort();
  }, [allProfissionais, byProfissional]);

  // Estatísticas calculadas dinamicamente com base no profissional selecionado
  const stats = useMemo(() => {
    if (!rawStats) return null;
    if (selectedProfissional === 'all') return rawStats;

    const filteredAnswers = rawRecent.filter(s => s.profissional === selectedProfissional && s.rating !== null);
    const filteredAll = rawRecent.filter(s => s.profissional === selectedProfissional);

    const totalSurveys = filteredAll.length;
    const answeredSurveys = filteredAnswers;
    const totalSent = filteredAll.filter(s => s.status === 'sent' || s.status === 'answered').length;
    const totalAnswered = answeredSurveys.length;
    
    const responseRate = totalSent > 0 ? ((totalAnswered / totalSent) * 100).toFixed(1) : '0.0';
    
    let avgRating = 0;
    if (totalAnswered > 0) {
      const sum = answeredSurveys.reduce((acc, curr) => acc + (curr.rating || 0), 0);
      avgRating = sum / totalAnswered;
    }

    const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    answeredSurveys.forEach((s) => {
      if (s.rating) {
        const score = Math.min(Math.max(s.rating, 1), 5);
        distribution[score] = (distribution[score] || 0) + 1;
      }
    });

    return {
      totalSurveys,
      totalSent,
      totalAnswered,
      responseRate,
      avgRating: avgRating.toFixed(1),
      distribution,
    };
  }, [rawStats, rawRecent, selectedProfissional]);

  // Lista de avaliações recentes filtradas pelo profissional selecionado
  const recent = useMemo(() => {
    if (selectedProfissional === 'all') return rawRecent;
    return rawRecent.filter(s => s.profissional === selectedProfissional);
  }, [rawRecent, selectedProfissional]);

  // Trigger survey send check every time page loads
  useEffect(() => {
    fetch('/api/surveys/send', { method: 'POST' }).catch(() => {});
  }, []);

  const ratingStars = (n: number) => '⭐'.repeat(n);
  const ratingColor = (n: number) => {
    if (n >= 4.5) return '#22c55e';
    if (n >= 3.5) return '#eab308';
    if (n >= 2.5) return '#f97316';
    return '#ef4444';
  };

  const statusLabel = (s: string) => {
    switch (s) {
      case 'scheduled': return { text: 'Agendada', color: '#94a3b8' };
      case 'sent': return { text: 'Enviada', color: '#3b82f6' };
      case 'answered': return { text: 'Respondida', color: '#22c55e' };
      case 'expired': return { text: 'Expirada', color: '#ef4444' };
      default: return { text: s, color: '#94a3b8' };
    }
  };

  const fmtDate = (d: string | null) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  const maxDistribution = stats ? Math.max(...Object.values(stats.distribution), 1) : 1;

  return (
    <AuthGuard allowedRoles={['ADMINISTRADOR']}>
      <div style={{ width: '100%', maxWidth: 1400, margin: '0 auto', minHeight: '100vh' }}>

        <main style={{ padding: '20px 16px 40px' }}>
          {/* Header */}
          <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
            <p className="m-0 text-[0.88rem] font-medium text-muted-foreground">
              Pesquisas de satisfação enviadas após cada atendimento
            </p>
          </div>

          {/* Seção de Filtros (Unidade, Profissional/Usuário e Período) */}
          <div className="flex flex-wrap items-center gap-4 mb-6 p-4 rounded-xl border border-border/50 bg-card shadow-sm">
            {/* Filtro por Unidade */}
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Unidade</span>
              <select
                value={selectedUnit}
                onChange={(e) => {
                  setSelectedUnit(e.target.value);
                  setSelectedProfissional('all'); // Reseta o profissional ao mudar a unidade
                }}
                className="flex h-9 min-w-[160px] rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-bold text-foreground shadow-sm transition-colors focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
              >
                <option value="Todas">Todas as Unidades</option>
                {units.map(u => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
            </div>

            {/* Filtro por Profissional (Usuário) */}
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Profissional / Usuário</span>
              <select
                value={selectedProfissional}
                onChange={(e) => setSelectedProfissional(e.target.value)}
                className="flex h-9 min-w-[200px] rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-bold text-foreground shadow-sm transition-colors focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
              >
                <option value="all">Todos os Profissionais</option>
                {profissionaisList.map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>

            {/* Filtro de Período de Tempo */}
            <div className="flex flex-col gap-1.5 ml-auto">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider text-right">Período</span>
              <div className="flex gap-1 bg-card rounded-lg p-1 border border-border">
                {[{ k: '7d', l: '7 dias' }, { k: '30d', l: '30 dias' }, { k: '90d', l: '90 dias' }, { k: 'all', l: 'Tudo' }].map(p => (
                  <button key={p.k} onClick={() => setPeriod(p.k)}
                    className={`px-3.5 py-1 rounded-md text-xs font-semibold cursor-pointer transition-all duration-150 ${period === p.k ? 'bg-primary text-white font-bold' : 'bg-transparent text-muted-foreground hover:text-foreground'}`}
                  >
                    {p.l}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
              <div style={{ width: 32, height: 32, border: '3px solid var(--border)', borderTop: '3px solid var(--primary)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
            </div>
          ) : (
            <>
              {/* Stats Cards */}
              <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {/* Average Rating */}
                <div className="flex flex-col items-center justify-center rounded-xl border border-border/50 bg-card p-5 text-center transition-all hover:shadow-md">
                  <div className="text-[2.5rem] font-bold leading-none" style={{ color: ratingColor(parseFloat(stats?.avgRating || '0')) }}>
                    {stats?.avgRating || '0'}
                  </div>
                  <div className="mt-2 text-[0.75rem] font-semibold uppercase tracking-wider text-muted-foreground">
                    NOTA MÉDIA
                  </div>
                  <div className="mt-2 text-[1.1rem]">
                    {ratingStars(Math.round(parseFloat(stats?.avgRating || '0')))}
                  </div>
                </div>

                {/* Total Responses */}
                <div className="flex flex-col items-center justify-center rounded-xl border border-border/50 bg-card p-5 text-center transition-all hover:shadow-md">
                  <div className="text-[2.5rem] font-bold leading-none text-primary">
                    {stats?.totalAnswered || 0}
                  </div>
                  <div className="mt-2 text-[0.75rem] font-semibold uppercase tracking-wider text-muted-foreground">
                    RESPOSTAS
                  </div>
                  <div className="mt-1 text-[0.72rem] text-muted-foreground">
                    de {stats?.totalSent || 0} enviadas
                  </div>
                </div>

                {/* Response Rate */}
                <div className="flex flex-col items-center justify-center rounded-xl border border-border/50 bg-card p-5 text-center transition-all hover:shadow-md">
                  <div className="text-[2.5rem] font-bold leading-none text-[#3b82f6]">
                    {stats?.responseRate || '0'}%
                  </div>
                  <div className="mt-2 text-[0.75rem] font-semibold uppercase tracking-wider text-muted-foreground">
                    TAXA DE RESPOSTA
                  </div>
                </div>

                {/* Total Scheduled */}
                <div className="flex flex-col items-center justify-center rounded-xl border border-border/50 bg-card p-5 text-center transition-all hover:shadow-md">
                  <div className="text-[2.5rem] font-bold leading-none text-muted-foreground">
                    {stats?.totalSurveys || 0}
                  </div>
                  <div className="mt-2 text-[0.75rem] font-semibold uppercase tracking-wider text-muted-foreground">
                    TOTAL DE PESQUISAS
                  </div>
                </div>
              </div>

              {/* Rating Distribution */}
              <div className="mb-6 rounded-xl border border-border/50 bg-card p-5 shadow-sm">
                <h3 className="mb-4 text-[0.95rem] font-bold text-foreground">
                  Distribuição de Notas
                </h3>
                <div className="flex flex-col gap-2.5">
                  {[5, 4, 3, 2, 1].map(n => {
                    const count = stats?.distribution[n] || 0;
                    const pct = maxDistribution > 0 ? (count / maxDistribution) * 100 : 0;
                    return (
                      <div key={n} className="flex items-center gap-3">
                        <div className="w-20 text-right text-[0.82rem] font-semibold text-foreground">
                          {ratingStars(n)}
                        </div>
                        <div className="relative h-6 flex-1 overflow-hidden rounded-md bg-background">
                          <div style={{
                            width: `${pct}%`, height: '100%', borderRadius: 6,
                            background: n >= 4 ? '#22c55e' : n === 3 ? '#eab308' : '#ef4444',
                            transition: 'width 0.5s ease',
                            minWidth: count > 0 ? 8 : 0,
                          }} />
                        </div>
                        <div className="w-10 text-center text-[0.82rem] font-bold text-foreground">
                          {count}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Tabs */}
              <div className="mb-5 flex gap-2 border-b border-border/50 pb-1">
                {([
                  { k: 'recentes', l: 'Últimas Avaliações', icon: 'history' },
                  { k: 'profissionais', l: 'Por Profissional', icon: 'person' },
                  { k: 'procedimentos', l: 'Por Procedimento', icon: 'medical_services' },
                ] as { k: typeof tab; l: string; icon: string }[]).map(t => (
                  <button key={t.k} onClick={() => setTab(t.k)}
                    className={`flex items-center gap-1.5 px-4 py-2 border-none bg-transparent cursor-pointer text-[0.82rem] font-semibold transition-all duration-150 border-b-2
                      ${tab === t.k ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
                    <span className="material-symbols-outlined text-[18px]">{t.icon}</span>
                    {t.l}
                  </button>
                ))}
              </div>

              {/* Tab Content */}
              {tab === 'recentes' && (
                <div className="flex flex-col gap-3">
                  {recent.length === 0 ? (
                    <div className="flex flex-col items-center justify-center p-10 text-muted-foreground">
                      <span className="material-symbols-outlined mb-2 text-[48px] opacity-40">inbox</span>
                      <p className="m-0 font-semibold">Nenhuma avaliação ainda</p>
                      <p className="mt-1 text-sm">As avaliações aparecerão aqui após os clientes responderem</p>
                    </div>
                  ) : recent.map(s => (
                    <div key={s.id} className="flex items-center gap-4 rounded-xl border border-border/50 bg-card p-4 shadow-sm transition-all hover:bg-muted/30">
                      {/* Rating */}
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: s.rating ? `${ratingColor(s.rating)}15` : 'var(--bg)' }}>
                        {s.rating ? (
                          <span className="text-[1.3rem] font-bold" style={{ color: ratingColor(s.rating) }}>{s.rating}</span>
                        ) : (
                          <span className="material-symbols-outlined text-[22px] text-muted-foreground">schedule</span>
                        )}
                      </div>

                      {/* Details */}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[0.88rem] font-bold text-foreground">{s.clientName}</span>
                          <span className="rounded-full px-2 py-0.5 text-[0.65rem] font-bold" style={{ backgroundColor: `${statusLabel(s.status).color}15`, color: statusLabel(s.status).color }}>
                            {statusLabel(s.status).text}
                          </span>
                        </div>
                        <div className="mt-0.5 text-[0.75rem] text-muted-foreground">
                          {s.procedimento} {s.profissional ? `• ${s.profissional}` : ''}
                        </div>
                        {s.comment && (
                          <div className="mt-2 rounded-md border-l-2 border-primary bg-background px-3 py-1.5 text-[0.78rem] italic text-foreground">
                            &quot;{s.comment}&quot;
                          </div>
                        )}
                      </div>

                      {/* Date */}
                      <div className="shrink-0 text-right">
                        <div className="text-[0.7rem] text-muted-foreground">
                          {s.answeredAt ? fmtDate(s.answeredAt) : fmtDate(s.createdAt)}
                        </div>
                        {s.rating && (
                          <div className="mt-1 text-[0.85rem]">
                            {ratingStars(s.rating)}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {tab === 'profissionais' && (
                <div className="overflow-hidden rounded-xl border border-border/50 bg-card shadow-sm">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="bg-background">
                        <th className="px-4 py-3 text-left text-[0.75rem] font-bold uppercase tracking-wider text-muted-foreground">Profissional</th>
                        <th className="px-4 py-3 text-center text-[0.75rem] font-bold uppercase tracking-wider text-muted-foreground">Avaliações</th>
                        <th className="px-4 py-3 text-center text-[0.75rem] font-bold uppercase tracking-wider text-muted-foreground">Nota Média</th>
                        <th className="px-4 py-3 text-center text-[0.75rem] font-bold uppercase tracking-wider text-muted-foreground">Estrelas</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {Object.entries(byProfissional)
                        .sort((a, b) => b[1].avg - a[1].avg)
                        .map(([name, data]) => (
                        <tr key={name} className="transition-colors hover:bg-muted/30">
                          <td className="px-4 py-3 text-[0.88rem] font-semibold text-foreground">{name}</td>
                          <td className="px-4 py-3 text-center text-[0.85rem] text-muted-foreground">{data.total}</td>
                          <td className="px-4 py-3 text-center">
                            <span className="text-[1rem] font-bold" style={{ color: ratingColor(data.avg) }}>
                              {data.avg.toFixed(1)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center text-[0.9rem]">
                            {ratingStars(Math.round(data.avg))}
                          </td>
                        </tr>
                      ))}
                      {Object.keys(byProfissional).length === 0 && (
                        <tr><td colSpan={4} className="p-8 text-center text-[0.85rem] text-muted-foreground">Nenhum dado</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {tab === 'procedimentos' && (
                <div className="overflow-hidden rounded-xl border border-border/50 bg-card shadow-sm">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="bg-background">
                        <th className="px-4 py-3 text-left text-[0.75rem] font-bold uppercase tracking-wider text-muted-foreground">Procedimento</th>
                        <th className="px-4 py-3 text-center text-[0.75rem] font-bold uppercase tracking-wider text-muted-foreground">Avaliações</th>
                        <th className="px-4 py-3 text-center text-[0.75rem] font-bold uppercase tracking-wider text-muted-foreground">Nota Média</th>
                        <th className="px-4 py-3 text-center text-[0.75rem] font-bold uppercase tracking-wider text-muted-foreground">Estrelas</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {Object.entries(byProcedimento)
                        .sort((a, b) => b[1].avg - a[1].avg)
                        .map(([name, data]) => (
                        <tr key={name} className="transition-colors hover:bg-muted/30">
                          <td className="px-4 py-3 text-[0.88rem] font-semibold text-foreground">{name}</td>
                          <td className="px-4 py-3 text-center text-[0.85rem] text-muted-foreground">{data.total}</td>
                          <td className="px-4 py-3 text-center">
                            <span className="text-[1rem] font-bold" style={{ color: ratingColor(data.avg) }}>
                              {data.avg.toFixed(1)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center text-[0.9rem]">
                            {ratingStars(Math.round(data.avg))}
                          </td>
                        </tr>
                      ))}
                      {Object.keys(byProcedimento).length === 0 && (
                        <tr><td colSpan={4} className="p-8 text-center text-[0.85rem] text-muted-foreground">Nenhum dado</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </main>

        <style>{`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    </AuthGuard>
  );
}
