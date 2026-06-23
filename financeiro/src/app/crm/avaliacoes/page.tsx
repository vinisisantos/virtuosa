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

  // Busca todos os profissionais cadastrados na unidade selecionada (ativos)
  useEffect(() => {
    const fetchProfissionais = async () => {
      try {
        const url = selectedUnit && selectedUnit !== 'Todas'
          ? `/api/profissionais?unit=${encodeURIComponent(selectedUnit)}`
          : '/api/profissionais';
        const res = await fetch(url);
        const data = await res.json();
        if (Array.isArray(data)) {
          const names = data.map((p: any) => p.name).sort();
          setAllProfissionais(names);
        }
      } catch (err) {
        console.error('Erro ao buscar profissionais da unidade:', err);
      }
    };
    fetchProfissionais();
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
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-main)', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 28, color: '#eab308' }}>star</span>
                Avaliações
              </h1>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '4px 0 0' }}>
                Pesquisas de satisfação enviadas após cada atendimento
              </p>
            </div>
          </div>

          {/* Seção de Filtros (Unidade, Profissional/Usuário e Período) */}
          <div className="flex flex-wrap items-center gap-4 mb-6 p-4 rounded-xl border border-border bg-card shadow-sm">
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
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
                {/* Average Rating */}
                <div style={{
                  background: 'var(--card-bg)', borderRadius: 12, padding: 20,
                  border: '1px solid var(--border)', textAlign: 'center',
                }}>
                  <div style={{ fontSize: '2.5rem', fontWeight: 800, color: ratingColor(parseFloat(stats?.avgRating || '0')), lineHeight: 1 }}>
                    {stats?.avgRating || '0'}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4, fontWeight: 600 }}>
                    NOTA MÉDIA
                  </div>
                  <div style={{ marginTop: 6, fontSize: '1.1rem' }}>
                    {ratingStars(Math.round(parseFloat(stats?.avgRating || '0')))}
                  </div>
                </div>

                {/* Total Responses */}
                <div style={{
                  background: 'var(--card-bg)', borderRadius: 12, padding: 20,
                  border: '1px solid var(--border)', textAlign: 'center',
                }}>
                  <div style={{ fontSize: '2.5rem', fontWeight: 800, color: 'var(--primary)', lineHeight: 1 }}>
                    {stats?.totalAnswered || 0}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4, fontWeight: 600 }}>
                    RESPOSTAS
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 4 }}>
                    de {stats?.totalSent || 0} enviadas
                  </div>
                </div>

                {/* Response Rate */}
                <div style={{
                  background: 'var(--card-bg)', borderRadius: 12, padding: 20,
                  border: '1px solid var(--border)', textAlign: 'center',
                }}>
                  <div style={{ fontSize: '2.5rem', fontWeight: 800, color: '#3b82f6', lineHeight: 1 }}>
                    {stats?.responseRate || '0'}%
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4, fontWeight: 600 }}>
                    TAXA DE RESPOSTA
                  </div>
                </div>

                {/* Total Scheduled */}
                <div style={{
                  background: 'var(--card-bg)', borderRadius: 12, padding: 20,
                  border: '1px solid var(--border)', textAlign: 'center',
                }}>
                  <div style={{ fontSize: '2.5rem', fontWeight: 800, color: 'var(--text-muted)', lineHeight: 1 }}>
                    {stats?.totalSurveys || 0}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4, fontWeight: 600 }}>
                    TOTAL DE PESQUISAS
                  </div>
                </div>
              </div>

              {/* Rating Distribution */}
              <div style={{
                background: 'var(--card-bg)', borderRadius: 12, padding: 20,
                border: '1px solid var(--border)', marginBottom: 24,
              }}>
                <h3 style={{ margin: '0 0 16px', fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-main)' }}>
                  Distribuição de Notas
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {[5, 4, 3, 2, 1].map(n => {
                    const count = stats?.distribution[n] || 0;
                    const pct = maxDistribution > 0 ? (count / maxDistribution) * 100 : 0;
                    return (
                      <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ width: 80, fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-main)', textAlign: 'right' }}>
                          {ratingStars(n)}
                        </div>
                        <div style={{ flex: 1, height: 24, background: 'var(--bg)', borderRadius: 6, overflow: 'hidden', position: 'relative' }}>
                          <div style={{
                            width: `${pct}%`, height: '100%', borderRadius: 6,
                            background: n >= 4 ? '#22c55e' : n === 3 ? '#eab308' : '#ef4444',
                            transition: 'width 0.5s ease',
                            minWidth: count > 0 ? 8 : 0,
                          }} />
                        </div>
                        <div style={{ width: 40, fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-main)', textAlign: 'center' }}>
                          {count}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Tabs */}
              <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid var(--border)', paddingBottom: 4 }}>
                {([
                  { k: 'recentes', l: 'Últimas Avaliações', icon: 'history' },
                  { k: 'profissionais', l: 'Por Profissional', icon: 'person' },
                  { k: 'procedimentos', l: 'Por Procedimento', icon: 'medical_services' },
                ] as { k: typeof tab; l: string; icon: string }[]).map(t => (
                  <button key={t.k} onClick={() => setTab(t.k)}
                    style={{
                      padding: '8px 16px', border: 'none', background: 'transparent', cursor: 'pointer',
                      fontSize: '0.82rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6,
                      color: tab === t.k ? 'var(--primary)' : 'var(--text-muted)',
                      borderBottom: tab === t.k ? '2px solid var(--primary)' : '2px solid transparent',
                      transition: 'all 0.15s',
                    }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>{t.icon}</span>
                    {t.l}
                  </button>
                ))}
              </div>

              {/* Tab Content */}
              {tab === 'recentes' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {recent.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 48, opacity: 0.4 }}>inbox</span>
                      <p style={{ margin: '8px 0 0', fontWeight: 600 }}>Nenhuma avaliação ainda</p>
                      <p style={{ fontSize: '0.8rem' }}>As avaliações aparecerão aqui após os clientes responderem</p>
                    </div>
                  ) : recent.map(s => (
                    <div key={s.id} style={{
                      background: 'var(--card-bg)', borderRadius: 10, padding: '14px 16px',
                      border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 14,
                      borderLeft: s.rating ? `4px solid ${ratingColor(s.rating)}` : '4px solid var(--border)',
                    }}>
                      {/* Rating */}
                      <div style={{
                        width: 48, height: 48, borderRadius: 10,
                        background: s.rating ? `${ratingColor(s.rating)}15` : 'var(--bg)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0,
                      }}>
                        {s.rating ? (
                          <span style={{ fontSize: '1.3rem', fontWeight: 800, color: ratingColor(s.rating) }}>{s.rating}</span>
                        ) : (
                          <span className="material-symbols-outlined" style={{ fontSize: 22, color: 'var(--text-muted)' }}>schedule</span>
                        )}
                      </div>

                      {/* Details */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--text-main)' }}>{s.clientName}</span>
                          <span style={{
                            padding: '2px 8px', borderRadius: 20, fontSize: '0.65rem', fontWeight: 700,
                            background: `${statusLabel(s.status).color}15`,
                            color: statusLabel(s.status).color,
                          }}>
                            {statusLabel(s.status).text}
                          </span>
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>
                          {s.procedimento} {s.profissional ? `• ${s.profissional}` : ''}
                        </div>
                        {s.comment && (
                          <div style={{
                            marginTop: 6, padding: '6px 10px', background: 'var(--bg)', borderRadius: 6,
                            fontSize: '0.78rem', color: 'var(--text-main)', fontStyle: 'italic',
                            borderLeft: '3px solid var(--primary)',
                          }}>
                            &quot;{s.comment}&quot;
                          </div>
                        )}
                      </div>

                      {/* Date */}
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                          {s.answeredAt ? fmtDate(s.answeredAt) : fmtDate(s.createdAt)}
                        </div>
                        {s.rating && (
                          <div style={{ fontSize: '0.85rem', marginTop: 4 }}>
                            {ratingStars(s.rating)}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {tab === 'profissionais' && (
                <div style={{ background: 'var(--card-bg)', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: 'var(--bg)' }}>
                        <th style={{ textAlign: 'left', padding: '12px 16px', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' as const }}>Profissional</th>
                        <th style={{ textAlign: 'center', padding: '12px 16px', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' as const }}>Avaliações</th>
                        <th style={{ textAlign: 'center', padding: '12px 16px', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' as const }}>Nota Média</th>
                        <th style={{ textAlign: 'center', padding: '12px 16px', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' as const }}>Estrelas</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(byProfissional)
                        .sort((a, b) => b[1].avg - a[1].avg)
                        .map(([name, data]) => (
                        <tr key={name} style={{ borderTop: '1px solid var(--border)' }}>
                          <td style={{ padding: '12px 16px', fontWeight: 600, fontSize: '0.88rem', color: 'var(--text-main)' }}>{name}</td>
                          <td style={{ padding: '12px 16px', textAlign: 'center', fontSize: '0.85rem', color: 'var(--text-muted)' }}>{data.total}</td>
                          <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                            <span style={{ fontWeight: 800, fontSize: '1rem', color: ratingColor(data.avg) }}>
                              {data.avg.toFixed(1)}
                            </span>
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'center', fontSize: '0.9rem' }}>
                            {ratingStars(Math.round(data.avg))}
                          </td>
                        </tr>
                      ))}
                      {Object.keys(byProfissional).length === 0 && (
                        <tr><td colSpan={4} style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Nenhum dado</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {tab === 'procedimentos' && (
                <div style={{ background: 'var(--card-bg)', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: 'var(--bg)' }}>
                        <th style={{ textAlign: 'left', padding: '12px 16px', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' as const }}>Procedimento</th>
                        <th style={{ textAlign: 'center', padding: '12px 16px', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' as const }}>Avaliações</th>
                        <th style={{ textAlign: 'center', padding: '12px 16px', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' as const }}>Nota Média</th>
                        <th style={{ textAlign: 'center', padding: '12px 16px', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' as const }}>Estrelas</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(byProcedimento)
                        .sort((a, b) => b[1].avg - a[1].avg)
                        .map(([name, data]) => (
                        <tr key={name} style={{ borderTop: '1px solid var(--border)' }}>
                          <td style={{ padding: '12px 16px', fontWeight: 600, fontSize: '0.88rem', color: 'var(--text-main)' }}>{name}</td>
                          <td style={{ padding: '12px 16px', textAlign: 'center', fontSize: '0.85rem', color: 'var(--text-muted)' }}>{data.total}</td>
                          <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                            <span style={{ fontWeight: 800, fontSize: '1rem', color: ratingColor(data.avg) }}>
                              {data.avg.toFixed(1)}
                            </span>
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'center', fontSize: '0.9rem' }}>
                            {ratingStars(Math.round(data.avg))}
                          </td>
                        </tr>
                      ))}
                      {Object.keys(byProcedimento).length === 0 && (
                        <tr><td colSpan={4} style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Nenhum dado</td></tr>
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
