'use client';
import { useState, useEffect, useCallback } from 'react';
import { toast } from '@/components/toast';

interface MetaLead {
  id: string;
  leadgenId: string;
  formId: string | null;
  formName: string | null;
  adId: string | null;
  adName: string | null;
  campaignId: string | null;
  campaignName: string | null;
  platform: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  clientId: string | null;
  status: string;
  errorMessage: string | null;
  processedAt: string | null;
  createdAt: string;
}

const statusConfig: Record<string, { color: string; bg: string; label: string; icon: string }> = {
  novo: { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', label: 'Novo', icon: 'fiber_new' },
  processado: { color: '#10b981', bg: 'rgba(16,185,129,0.1)', label: 'Processado', icon: 'check_circle' },
  erro: { color: '#ef4444', bg: 'rgba(239,68,68,0.1)', label: 'Erro', icon: 'error' },
};

export default function LeadsPage() {
  const [leads, setLeads] = useState<MetaLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [reprocessing, setReprocessing] = useState<string | null>(null);
  const [startDate, setStartDate] = useState('');
  const [startTime, setStartTime] = useState('00:00');
  const [endDate, setEndDate] = useState('');
  const [endTime, setEndTime] = useState('23:59');

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '500' });
      if (filter !== 'all') params.set('status', filter);
      if (startDate) params.set('startDate', startDate);
      if (startTime) params.set('startTime', startTime);
      if (endDate) params.set('endDate', endDate);
      if (endTime) params.set('endTime', endTime);
      const res = await fetch(`/api/leads?${params}`);
      const data = await res.json();
      setLeads(Array.isArray(data) ? data : []);
    } catch { /* ignore */ }
    setLoading(false);
  }, [filter, startDate, startTime, endDate, endTime]);

  useEffect(() => { fetchLeads(); }, [fetchLeads]);

  const reprocess = async (leadId: string) => {
    setReprocessing(leadId);
    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId }),
      });
      const data = await res.json();
      if (data.success) {
        toast('✅ Lead reprocessado com sucesso!', 'success');
        fetchLeads();
      } else {
        toast(`❌ Erro: ${data.error}`, 'error');
      }
    } catch {
      toast('Erro ao reprocessar', 'error');
    }
    setReprocessing(null);
  };

  const fmtDate = (d: string) => new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const todayKey = () => new Date().toISOString().slice(0, 10);
  const clearDateFilters = () => {
    setStartDate('');
    setStartTime('00:00');
    setEndDate('');
    setEndTime('23:59');
  };
  const setTodayUntilNoon = () => {
    const today = todayKey();
    setStartDate(today);
    setStartTime('00:00');
    setEndDate(today);
    setEndTime('12:00');
  };
  const exportCsv = () => {
    const rows = [
      ['Nome', 'Telefone', 'Email', 'Status', 'Plataforma', 'Campanha', 'Criado em'],
      ...leads.map((lead) => [
        lead.name || '',
        lead.phone || '',
        lead.email || '',
        lead.status || '',
        lead.platform || '',
        lead.campaignName || '',
        fmtDate(lead.createdAt),
      ]),
    ];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(';')).join('\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const cardS: React.CSSProperties = { background: 'var(--card-bg)', borderRadius: 16, border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' };
  const sectionS: React.CSSProperties = { background: 'var(--bg)', borderRadius: 16, border: '1px solid var(--border)', padding: '20px 24px' };

  const counts = {
    all: leads.length,
    novo: leads.filter(l => l.status === 'novo').length,
    processado: leads.filter(l => l.status === 'processado').length,
    erro: leads.filter(l => l.status === 'erro').length,
  };

  return (
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col">
        <main className="flex-1 p-5">
          {/* Header */}
          <section className="mb-4 mt-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="m-0 text-[0.88rem] font-medium text-muted-foreground">
                Leads capturados via Facebook/Instagram Lead Ads
              </p>
            </div>
            <div className="flex gap-2">
              <button onClick={exportCsv} className="flex items-center gap-1.5 rounded-xl border border-border/50 bg-card px-4 py-2 text-[0.8rem] font-bold text-foreground shadow-sm transition-all hover:bg-muted/30">
                <span className="material-symbols-outlined text-[18px] text-primary">download</span>
                Exportar CSV
              </button>
              <a href="/crm/pipeline" className="flex items-center gap-1.5 rounded-xl border border-border/50 bg-card px-4 py-2 text-[0.8rem] font-bold text-foreground no-underline shadow-sm transition-all hover:bg-muted/30">
                <span className="material-symbols-outlined text-[18px] text-primary">funnel_chart</span>
                Funil
              </a>
            </div>
          </section>

          {/* Status KPIs */}
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { key: 'all', label: 'Total', value: counts.all, color: '#6366f1', icon: 'people' },
              { key: 'novo', label: 'Novos', value: counts.novo, color: '#f59e0b', icon: 'fiber_new' },
              { key: 'processado', label: 'Processados', value: counts.processado, color: '#10b981', icon: 'check_circle' },
              { key: 'erro', label: 'Com Erro', value: counts.erro, color: '#ef4444', icon: 'error' },
            ].map(k => (
              <button key={k.key} onClick={() => setFilter(k.key)}
                className={`flex cursor-pointer items-center gap-3 rounded-xl border bg-card p-4 text-left shadow-sm transition-all hover:shadow-md ${filter === k.key ? 'border-primary ring-1 ring-primary' : 'border-border/50'}`}>
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: `${k.color}15` }}>
                  <span className="material-symbols-outlined text-[18px]" style={{ color: k.color }}>{k.icon}</span>
                </div>
                <div>
                  <div className="text-[0.6rem] font-bold uppercase tracking-wider text-muted-foreground">{k.label}</div>
                  <div className="text-xl font-bold text-foreground">{k.value}</div>
                </div>
              </button>
            ))}
          </div>

          <div className="mb-4 rounded-xl border border-border/50 bg-card p-4 shadow-sm">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="m-0 text-sm font-bold text-foreground">Filtro por data e horário</h2>
                <p className="mt-1 text-xs text-muted-foreground">Use um intervalo exato para consultar e exportar os leads capturados.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button onClick={setTodayUntilNoon} className="rounded-lg border border-border px-3 py-2 text-xs font-bold text-muted-foreground hover:bg-muted">Hoje até 12h</button>
                <button onClick={clearDateFilters} className="rounded-lg border border-border px-3 py-2 text-xs font-bold text-muted-foreground hover:bg-muted">Limpar período</button>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Data inicial
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground" />
              </label>
              <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Horário inicial
                <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground" />
              </label>
              <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Data final
                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground" />
              </label>
              <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Horário final
                <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground" />
              </label>
            </div>
          </div>

          {/* Leads List */}
          <div className="rounded-xl border border-border/50 bg-card p-5 shadow-sm">
            {loading ? (
              <div className="py-10 text-center text-muted-foreground">
                <span className="material-symbols-outlined animate-spin text-4xl">progress_activity</span>
              </div>
            ) : leads.length === 0 ? (
              <div className="py-14 text-center">
                <span className="material-symbols-outlined text-[56px] text-muted-foreground/30">campaign</span>
                <p className="mt-3 text-[0.9rem] font-medium text-muted-foreground">Nenhum lead capturado ainda</p>
                <p className="mt-1 text-[0.78rem] text-muted-foreground/80">
                  Configure a Meta API em Configurações e conecte seus Lead Ads
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-2.5">
                {leads.map(lead => {
                  const st = statusConfig[lead.status] || statusConfig.novo;
                  return (
                    <div key={lead.id} className="flex items-center gap-4 rounded-xl border border-border/50 bg-background p-4 shadow-sm transition-all hover:bg-muted/30">
                      {/* Avatar */}
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: `${st.color}15` }}>
                        <span className="material-symbols-outlined text-[20px]" style={{ color: st.color }}>{st.icon}</span>
                      </div>

                      {/* Info */}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[0.9rem] font-bold text-foreground">
                            {lead.name || 'Sem nome'}
                          </span>
                          <span className="rounded-md px-2 py-0.5 text-[0.65rem] font-bold" style={{ backgroundColor: st.bg, color: st.color }}>
                            {st.label}
                          </span>
                          {lead.platform && (
                            <span className="rounded-md px-2 py-0.5 text-[0.6rem] font-semibold" style={{ backgroundColor: lead.platform === 'instagram' ? 'rgba(225,48,108,0.1)' : 'rgba(59,130,246,0.1)', color: lead.platform === 'instagram' ? '#e1306c' : '#3b82f6' }}>
                              {lead.platform}
                            </span>
                          )}
                        </div>
                        <div className="mt-1.5 flex flex-wrap gap-3 text-[0.78rem] text-muted-foreground">
                          {lead.phone && (
                            <span className="flex items-center gap-1">
                              <span className="material-symbols-outlined text-[14px]">phone</span>
                              {lead.phone}
                            </span>
                          )}
                          {lead.email && (
                            <span className="flex items-center gap-1">
                              <span className="material-symbols-outlined text-[14px]">email</span>
                              {lead.email}
                            </span>
                          )}
                          {lead.campaignName && (
                            <span className="flex items-center gap-1">
                              <span className="material-symbols-outlined text-[14px]">campaign</span>
                              {lead.campaignName}
                            </span>
                          )}
                        </div>
                        {lead.errorMessage && (
                          <div className="mt-1.5 text-[0.72rem] italic text-red-500">
                            {lead.errorMessage}
                          </div>
                        )}
                      </div>

                      {/* Date */}
                      <div className="shrink-0 text-right">
                        <div className="text-[0.72rem] text-muted-foreground">{fmtDate(lead.createdAt)}</div>
                        {lead.status === 'erro' && (
                          <button onClick={() => reprocess(lead.id)} disabled={reprocessing === lead.id}
                            className={`mt-1.5 flex cursor-pointer items-center gap-1 rounded-lg border-none px-3 py-1.5 text-[0.7rem] font-bold text-white transition-opacity ${reprocessing === lead.id ? 'cursor-not-allowed bg-slate-400' : 'bg-gradient-to-br from-amber-500 to-amber-600 hover:opacity-90'}`}>
                            <span className="material-symbols-outlined text-[14px]">refresh</span>
                            {reprocessing === lead.id ? 'Processando...' : 'Reprocessar'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </main>
      </div>
  );
}
