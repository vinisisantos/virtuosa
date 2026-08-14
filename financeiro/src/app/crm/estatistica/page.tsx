'use client';
import { useState, useEffect, useCallback } from 'react';
import { useGlobalUnit } from '@/contexts/UnitContext';
import { DatePicker } from '@/components/ui/date-picker';
import { isGenericCampaignName } from '@/lib/campaign-labels';
import type {
  CommercialIndicatorBreakdown,
  CommercialIndicators,
} from '@/lib/crm/commercial-indicators';

function todayDateInputFrom(input = new Date()) {
  const date = input;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function todayDateInput() {
  return todayDateInputFrom();
}

interface Client {
  id: string; name: string; phone: string | null; email: string | null;
  conversationId?: string;
  unit: string; tags: string | null; totalSpent: number; visitCount: number;
  lastVisit: string | null; stage: string; createdAt: string; arrivedAt?: string | null;
  source?: string | null; campaignName?: string | null; fbclid?: string | null;
}

interface NotLeadEntry {
  id: string;
  createdAt: string;
  unit: string;
}

interface LeadCountAdjustment {
  date: string;
  unit: string;
  count: number;
}

interface CommercialIndicatorsResponse extends CommercialIndicators {
  coverage: CommercialIndicators['coverage'] & {
    appointmentsWithMarker: number;
    appointmentsWithoutMarker: number;
    appointmentsLinkedToCohort: number;
  };
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

const formatMinutes = (value: number | null) => {
  if (value === null) return '—';
  if (value < 60) return `${value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} min`;
  const hours = Math.floor(value / 60);
  const minutes = Math.round(value % 60);
  return minutes > 0 ? `${hours}h ${minutes}min` : `${hours}h`;
};

function CommercialBreakdownTable({
  title,
  icon,
  rows,
}: {
  title: string;
  icon: string;
  rows: CommercialIndicatorBreakdown[];
}) {
  return (
    <div className="min-w-0 rounded-xl border border-border/50 bg-background/50 p-3">
      <h4 className="mb-3 flex items-center gap-2 text-sm font-black text-foreground">
        <span className="material-symbols-outlined text-[17px] text-primary">{icon}</span>
        {title}
      </h4>
      <div className="overflow-x-auto [scrollbar-width:thin]">
        <table className="w-full min-w-[650px] border-separate border-spacing-0 text-left text-[0.7rem]">
          <thead>
            <tr className="text-[0.6rem] uppercase tracking-wide text-muted-foreground">
              <th className="border-b border-border/50 px-2 py-2">Origem</th>
              <th className="border-b border-border/50 px-2 py-2 text-right">Recebidos</th>
              <th className="border-b border-border/50 px-2 py-2 text-right">Contatados</th>
              <th className="border-b border-border/50 px-2 py-2 text-right">Responderam</th>
              <th className="border-b border-border/50 px-2 py-2 text-right">Taxa resp.</th>
              <th className="border-b border-border/50 px-2 py-2 text-right">Agendados</th>
              <th className="border-b border-border/50 px-2 py-2 text-right">Compareceram</th>
              <th className="border-b border-border/50 px-2 py-2 text-right">Fechou</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="text-foreground">
                <td className="max-w-[220px] truncate border-b border-border/30 px-2 py-2.5 font-bold" title={row.label}>{row.label}</td>
                <td className="border-b border-border/30 px-2 py-2.5 text-right font-bold">{row.received}</td>
                <td className="border-b border-border/30 px-2 py-2.5 text-right">{row.contacted}</td>
                <td className="border-b border-border/30 px-2 py-2.5 text-right">{row.responded}</td>
                <td className="border-b border-border/30 px-2 py-2.5 text-right font-bold text-primary">{row.rates.response.percentage}%</td>
                <td className="border-b border-border/30 px-2 py-2.5 text-right">{row.scheduled}</td>
                <td className="border-b border-border/30 px-2 py-2.5 text-right">{row.attended}</td>
                <td className="border-b border-border/30 px-2 py-2.5 text-right font-bold text-emerald-500">{row.closed}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const leadDate = (client: Pick<Client, 'arrivedAt' | 'createdAt'>) => new Date(client.arrivedAt || client.createdAt);
const isGenericCampaign = (value?: string | null) => isGenericCampaignName(value);
const parseDateInput = (value: string) => {
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return new Date();
  return new Date(year, month - 1, day);
};
const formatDayMonth = (date: Date) => {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}`;
};
const dateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export default function CrmEstatisticaPage() {
  const { units: UNITS, globalUnit } = useGlobalUnit();
  const [ctwaLeads, setCtwaLeads] = useState<Client[]>([]);
  const [monthlyCtwaLeads, setMonthlyCtwaLeads] = useState<Client[]>([]);
  const [leadAdjustments, setLeadAdjustments] = useState<LeadCountAdjustment[]>([]);
  const [monthlyLeadAdjustments, setMonthlyLeadAdjustments] = useState<LeadCountAdjustment[]>([]);
  const [notLeadEntries, setNotLeadEntries] = useState<NotLeadEntry[]>([]);
  const [scheduledEvaluations, setScheduledEvaluations] = useState<number | null>(null);
  const [scheduledEvaluationsLoading, setScheduledEvaluationsLoading] = useState(true);
  const [commercialIndicators, setCommercialIndicators] = useState<CommercialIndicatorsResponse | null>(null);
  const [commercialIndicatorsLoading, setCommercialIndicatorsLoading] = useState(true);
  const [commercialIndicatorsError, setCommercialIndicatorsError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [stages, setStages] = useState(DEFAULT_STAGES);
  
  const [startDate, setStartDate] = useState(todayDateInput);
  const [endDate, setEndDate] = useState(todayDateInput);
  // Filtro opcional de horário (precisão além do dia)
  const [startTime, setStartTime] = useState('00:00');
  const [endTime, setEndTime] = useState('23:59');
  const [showTime, setShowTime] = useState(true);

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
      params.set('includeNotLeads', 'true');

      const ctwaRes = await fetch(`/api/crm/estatistica/ctwa?${params}`);
      const ctwaData = await ctwaRes.json();
      setCtwaLeads(ctwaData.leads || []);
      setLeadAdjustments(ctwaData.manualAdjustments || []);
      setNotLeadEntries(ctwaData.notLeads || []);
    } catch {
      setCtwaLeads([]);
      setLeadAdjustments([]);
      setNotLeadEntries([]);
    }
    finally { setLoading(false); }
  }, [globalUnit, startDate, endDate]);

  const fetchMonthlyLeads = useCallback(async () => {
    try {
      const now = new Date();
      const selectedStart = parseDateInput(startDate);
      const selectedEnd = parseDateInput(endDate);
      const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
      const selectedMonthStart = new Date(selectedStart.getFullYear(), selectedStart.getMonth(), 1);
      const selectedMonthEnd = new Date(selectedEnd.getFullYear(), selectedEnd.getMonth() + 1, 0);
      const start = selectedMonthStart < sixMonthsAgo ? selectedMonthStart : sixMonthsAgo;
      const end = selectedMonthEnd > now ? now : selectedMonthEnd;
      const params = new URLSearchParams({
        limit: '5000',
        startDate: todayDateInputFrom(start),
        endDate: todayDateInputFrom(end),
      });
      if (globalUnit) params.set('unit', globalUnit);

      const ctwaRes = await fetch(`/api/crm/estatistica/ctwa?${params}`);
      const ctwaData = await ctwaRes.json();
      setMonthlyCtwaLeads(ctwaData.leads || []);
      setMonthlyLeadAdjustments(ctwaData.manualAdjustments || []);
    } catch {
      setMonthlyCtwaLeads([]);
      setMonthlyLeadAdjustments([]);
    }
  }, [globalUnit, startDate, endDate]);

  const fetchScheduledEvaluations = useCallback(async () => {
    setScheduledEvaluationsLoading(true);
    try {
      const params = new URLSearchParams({ startDate, endDate });
      if (globalUnit) params.set('unit', globalUnit);
      if (showTime) {
        params.set('startTime', startTime);
        params.set('endTime', endTime);
      }

      const response = await fetch(`/api/crm/estatistica/evaluations?${params}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Erro ao carregar avaliações agendadas');
      setScheduledEvaluations(Number(data.scheduledEvaluations));
    } catch {
      setScheduledEvaluations(null);
    } finally {
      setScheduledEvaluationsLoading(false);
    }
  }, [endDate, globalUnit, showTime, startDate, startTime, endTime]);

  const fetchCommercialIndicators = useCallback(async () => {
    setCommercialIndicatorsLoading(true);
    setCommercialIndicatorsError(null);
    try {
      const params = new URLSearchParams({ startDate, endDate });
      if (globalUnit) params.set('unit', globalUnit);
      if (showTime) {
        params.set('startTime', startTime);
        params.set('endTime', endTime);
      }
      const response = await fetch(`/api/crm/estatistica/commercial?${params}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Erro ao carregar indicadores comerciais');
      setCommercialIndicators(data);
    } catch (error) {
      setCommercialIndicators(null);
      setCommercialIndicatorsError(error instanceof Error ? error.message : 'Erro ao carregar indicadores comerciais');
    } finally {
      setCommercialIndicatorsLoading(false);
    }
  }, [endDate, globalUnit, showTime, startDate, startTime, endTime]);

  useEffect(() => { fetchClients(); fetchMonthlyLeads(); }, [fetchClients, fetchMonthlyLeads]);
  useEffect(() => { fetchScheduledEvaluations(); }, [fetchScheduledEvaluations]);
  useEffect(() => { fetchCommercialIndicators(); }, [fetchCommercialIndicators]);

  // Refina por horário (client-side) sobre os leads já filtrados por data no servidor
  const leads = showTime
    ? ctwaLeads.filter(c => {
        const d = leadDate(c);
        const from = new Date(`${startDate}T${startTime}:00`);
        const to = new Date(`${endDate}T${endTime}:59`);
        return d >= from && d <= to;
      })
    : ctwaLeads;

  const notLeads = showTime
    ? notLeadEntries.filter(entry => {
        const createdAt = new Date(entry.createdAt);
        const from = new Date(`${startDate}T${startTime}:00`);
        const to = new Date(`${endDate}T${endTime}:59`);
        return createdAt >= from && createdAt <= to;
      })
    : notLeadEntries;

  // Stats
  const manualAdjustmentTotal = leadAdjustments.reduce((sum, adjustment) => sum + adjustment.count, 0);
  const total = leads.length + manualAdjustmentTotal;
  const byStage = stages.map(s => ({ ...s, count: leads.filter(c => (c.stage || 'entrada') === s.key).length }));
  const funnelStages = manualAdjustmentTotal > 0
    ? [...byStage, { key: 'ajuste_manual', label: 'Ajustes manuais', color: '#0ea5e9', count: manualAdjustmentTotal }]
    : byStage;
  const vendas = byStage.find(s => s.key === 'venda')?.count || 0;
  const naoVendas = byStage.find(s => s.key === 'nao_venda')?.count || 0;
  const taxaConversao = total > 0 ? ((vendas / total) * 100).toFixed(1) : '0';
  const totalFaturado = leads.filter(c => (c.stage || 'entrada') === 'venda').reduce((s, c) => s + c.totalSpent, 0);
  const ticketMedio = vendas > 0 ? totalFaturado / vendas : 0;
  const totalVisitas = leads.reduce((s, c) => s + c.visitCount, 0);
  const historicalLeadMap = new Map<string, Client>();
  [...monthlyCtwaLeads, ...leads].forEach((lead) => {
    const key = lead.conversationId || `${lead.id}:${leadDate(lead).toISOString()}`;
    if (!historicalLeadMap.has(key)) historicalLeadMap.set(key, lead);
  });
  const historicalLeads = Array.from(historicalLeadMap.values());

  // By unit
  const visibleUnits = globalUnit ? [globalUnit] : UNITS.filter(Boolean);
  const byUnit = visibleUnits.map(u => {
    const uc = leads.filter(c => c.unit === u);
    const unitAdjustments = leadAdjustments
      .filter(adjustment => adjustment.unit === u)
      .reduce((sum, adjustment) => sum + adjustment.count, 0);
    const unitTotal = uc.length + unitAdjustments;
    const uVendas = uc.filter(c => (c.stage || 'entrada') === 'venda').length;
    return { unit: u, total: unitTotal, vendas: uVendas, taxa: unitTotal > 0 ? ((uVendas / unitTotal) * 100).toFixed(1) : '0', faturado: uc.filter(c => (c.stage || 'entrada') === 'venda').reduce((s, c) => s + c.totalSpent, 0) };
  });

  // Top clients by spending
  const topClients = [...leads].sort((a, b) => b.totalSpent - a.totalSpent).slice(0, 10);

  // Monthly new leads (last 6 months)
  const now = new Date();
  const monthChartAnchor = parseDateInput(startDate);
  const months: { label: string; count: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(monthChartAnchor.getFullYear(), monthChartAnchor.getMonth() - i, 1);
    const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    const label = `${monthNames[d.getMonth()]}/${String(d.getFullYear()).slice(-2)}`;
    const detailedCount = historicalLeads.filter(c => {
      const cd = leadDate(c);
      return cd.getMonth() === d.getMonth() && cd.getFullYear() === d.getFullYear();
    }).length;
    const adjustmentCount = monthlyLeadAdjustments
      .filter(adjustment => {
        const [year, month] = adjustment.date.split('-').map(Number);
        return month === d.getMonth() + 1 && year === d.getFullYear();
      })
      .reduce((sum, adjustment) => sum + adjustment.count, 0);
    months.push({ label, count: detailedCount + adjustmentCount });
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
  if (manualAdjustmentTotal > 0) {
    campaignMap['Ajustes manuais (sem dimensão de campanha)'] = {
      leads: manualAdjustmentTotal,
      vendas: 0,
      faturado: 0,
    };
  }
  const topCampaigns = Object.entries(campaignMap)
    .map(([name, stats]) => ({ name, ...stats }))
    .sort((a, b) => b.leads - a.leads);
  const maxCampaignLeads = Math.max(...topCampaigns.map(c => c.leads), 1);

  // Tags distribution
  const tagCounts: Record<string, number> = {};
  leads.forEach(c => { if (c.tags) c.tags.split(',').forEach(t => { const tag = t.trim(); if (tag) tagCounts[tag] = (tagCounts[tag] || 0) + 1; }); });
  const topTags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 8);

  // Horários com maior receptividade por dia do mês selecionado.
  const selectedMonthAnchor = parseDateInput(startDate);
  const selectedMonthStart = new Date(selectedMonthAnchor.getFullYear(), selectedMonthAnchor.getMonth(), 1);
  const selectedMonthEnd = new Date(selectedMonthAnchor.getFullYear(), selectedMonthAnchor.getMonth() + 1, 0);
  const selectedMonthDays = Array.from({ length: selectedMonthEnd.getDate() }, (_, index) => (
    new Date(selectedMonthStart.getFullYear(), selectedMonthStart.getMonth(), index + 1)
  ));
  const startMinutes = (() => {
    const [hour, minute] = startTime.split(':').map(Number);
    return (hour || 0) * 60 + (minute || 0);
  })();
  const endMinutes = (() => {
    const [hour, minute] = endTime.split(':').map(Number);
    return (hour || 0) * 60 + (minute || 0);
  })();
  const isInsideSelectedTime = (date: Date) => {
    if (!showTime) return true;
    const minutes = date.getHours() * 60 + date.getMinutes();
    if (startMinutes <= endMinutes) return minutes >= startMinutes && minutes <= endMinutes;
    return minutes >= startMinutes || minutes <= endMinutes;
  };
  const hourlyByDay = selectedMonthDays.map(day => {
    const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0 }));
    historicalLeads.forEach(lead => {
      const date = leadDate(lead);
      if (dateKey(date) === dateKey(day) && isInsideSelectedTime(date)) {
        hours[date.getHours()].count += 1;
      }
    });
    const topHours = hours
      .filter(item => item.count > 0)
      .sort((a, b) => b.count - a.count || a.hour - b.hour)
      .slice(0, 6)
      .sort((a, b) => a.hour - b.hour);
    return {
      key: dateKey(day),
      label: formatDayMonth(day),
      weekday: day.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', ''),
      topHours,
      total: hours.reduce((sum, item) => sum + item.count, 0),
    };
  });
  const maxHourlyLeadCount = Math.max(
    1,
    ...hourlyByDay.flatMap(day => day.topHours.map(item => item.count)),
  );
  const bestHourlyWindow = hourlyByDay
    .flatMap(day => day.topHours.map(hour => ({ day: day.label, weekday: day.weekday, ...hour })))
    .sort((a, b) => b.count - a.count || a.hour - b.hour)[0] || null;
  const hourlyDaysWithLeads = hourlyByDay.filter(day => day.total > 0);

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
              <div className="flex items-center gap-2">
                <DatePicker value={startDate} onChange={setStartDate} variant="compact" calendarSize="small" placeholder="Data inicial" />
                {showTime && (
                  <input
                    type="time"
                    value={startTime}
                    onChange={e => setStartTime(e.target.value)}
                    className="h-9 w-[92px] shrink-0 rounded-lg border border-primary/60 bg-background px-2 text-[0.78rem] font-semibold text-foreground outline-none focus:border-primary"
                  />
                )}
              </div>
            </div>
            <div className="min-w-[140px]">
              <label className="mb-1 flex items-center gap-1.5 text-[0.65rem] font-bold uppercase tracking-wider text-muted-foreground/80">
                <span className="material-symbols-outlined text-[14px]">event</span>
                Período Final
              </label>
              <div className="flex items-center gap-2">
                <DatePicker value={endDate} onChange={setEndDate} variant="compact" calendarSize="small" placeholder="Data final" />
                {showTime && (
                  <input
                    type="time"
                    value={endTime}
                    onChange={e => setEndTime(e.target.value)}
                    className="h-9 w-[92px] shrink-0 rounded-lg border border-primary/60 bg-background px-2 text-[0.78rem] font-semibold text-foreground outline-none focus:border-primary"
                  />
                )}
              </div>
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
            <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
              {[
                {
                  icon: 'groups',
                  color: '#6366f1',
                  label: 'Leads recebidos',
                  value: String(total),
                  title: manualAdjustmentTotal > 0
                    ? `${leads.length} identificados automaticamente + ${manualAdjustmentTotal} ajustes manuais auditáveis`
                    : 'Leads identificados automaticamente no WhatsApp',
                },
                {
                  icon: 'event_available',
                  color: '#0ea5e9',
                  label: 'Avaliações Agendadas',
                  value: scheduledEvaluationsLoading ? '…' : scheduledEvaluations === null ? '—' : String(scheduledEvaluations),
                  title: 'Pessoas que receberam o status Agendado no período selecionado',
                },
                { icon: 'person_off', color: '#94a3b8', label: 'Não é lead', value: String(notLeads.length) },
                { icon: 'check_circle', color: '#10b981', label: 'Vendas', value: String(vendas) },
                { icon: 'cancel', color: '#ef4444', label: 'Não Vendas', value: String(naoVendas) },
                { icon: 'trending_up', color: '#f59e0b', label: 'Taxa Conversão', value: `${taxaConversao}%` },
                { icon: 'payments', color: '#8b5cf6', label: 'Total Faturado', value: fmt(totalFaturado) },
                { icon: 'receipt', color: '#14b8a6', label: 'Ticket Médio', value: fmt(ticketMedio) },
              ].map(kpi => (
                <div key={kpi.label} title={kpi.title} className="flex flex-col justify-center rounded-xl border border-border/50 bg-card p-4 transition-all hover:shadow-md">
                  <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80">
                    <div className="flex items-center justify-center rounded-md p-1.5" style={{ background: `${kpi.color}15` }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 16, color: kpi.color }}>{kpi.icon}</span>
                    </div>
                    <span>{kpi.label}</span>
                  </div>
                  <div className="mt-1 truncate text-[1.1rem] font-bold text-foreground" title={kpi.title || kpi.value}>{kpi.value}</div>
                </div>
              ))}
            </div>

            {manualAdjustmentTotal > 0 && (
              <div className="mb-4 flex items-start gap-2 rounded-xl border border-sky-500/20 bg-sky-500/10 px-3 py-2 text-xs text-muted-foreground">
                <span className="material-symbols-outlined mt-0.5 text-[16px] text-sky-500">info</span>
                <span>
                  O período inclui <strong className="text-foreground">{manualAdjustmentTotal} lead{manualAdjustmentTotal === 1 ? '' : 's'} de ajuste manual</strong>.
                  Eles entram nos totais, tendências e taxas; dimensões sem registro próprio, como horário, telefone e campanha, permanecem separadas para não criar dados fictícios.
                </span>
              </div>
            )}

            {/* ── Indicadores comerciais — coorte de leads qualificados ── */}
            <section className="mb-4 rounded-xl border border-border/50 bg-card p-3 shadow-sm sm:p-4">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="m-0 flex items-center gap-2 text-[0.95rem] font-black text-foreground">
                    <span className="material-symbols-outlined text-[19px] text-primary">monitoring</span>
                    Indicadores comerciais
                  </h3>
                  <p className="mt-1 text-[0.7rem] font-medium text-muted-foreground">
                    Coorte de leads qualificados recebidos no período. As mensagens são consolidadas com segurança no servidor.
                  </p>
                </div>
                <span className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[0.64rem] font-bold text-primary">
                  Atualiza com período e unidade
                </span>
              </div>

              {commercialIndicatorsLoading ? (
                <div className="flex min-h-32 items-center justify-center gap-2 rounded-xl border border-border/40 bg-background/40 text-sm text-muted-foreground">
                  <span className="material-symbols-outlined animate-spin text-[20px]">progress_activity</span>
                  Calculando indicadores…
                </div>
              ) : commercialIndicatorsError ? (
                <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-5 text-sm font-semibold text-red-500">
                  {commercialIndicatorsError}
                </div>
              ) : commercialIndicators ? (
                <>
                  <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-8">
                    {[
                      { label: 'Recebidos', value: commercialIndicators.totals.received, icon: 'person_add', color: '#6366f1' },
                      { label: 'Contatados', value: commercialIndicators.totals.contacted, icon: 'outgoing_mail', color: '#0ea5e9' },
                      { label: 'Responderam', value: commercialIndicators.totals.responded, icon: 'forum', color: '#14b8a6' },
                      { label: 'Agendados', value: commercialIndicators.totals.scheduled, icon: 'event_available', color: '#8b5cf6' },
                      { label: 'Compareceram', value: commercialIndicators.totals.attended, icon: 'how_to_reg', color: '#10b981' },
                      { label: 'Faltaram', value: commercialIndicators.totals.missed, icon: 'event_busy', color: '#f59e0b' },
                      { label: 'Fechou', value: commercialIndicators.totals.closed, icon: 'verified', color: '#10b981' },
                      { label: 'Não fechou', value: commercialIndicators.totals.notClosed, icon: 'close', color: '#ef4444' },
                    ].map((metric) => (
                      <div key={metric.label} className="rounded-xl border border-border/40 bg-background/50 p-3">
                        <div className="mb-2 flex items-center gap-1.5 text-[0.58rem] font-bold uppercase tracking-wide text-muted-foreground">
                          <span className="material-symbols-outlined text-[15px]" style={{ color: metric.color }}>{metric.icon}</span>
                          {metric.label}
                        </div>
                        <div className="text-xl font-black text-foreground">{metric.value}</div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
                    {[
                      { label: '1ª resposta média', value: formatMinutes(commercialIndicators.totals.firstResponseMinutes.average) },
                      { label: 'Mediana', value: formatMinutes(commercialIndicators.totals.firstResponseMinutes.median) },
                      { label: 'P90', value: formatMinutes(commercialIndicators.totals.firstResponseMinutes.p90) },
                      { label: 'SLA até 15 min', value: `${commercialIndicators.totals.rates.sla15.percentage}%` },
                    ].map((metric) => (
                      <div key={metric.label} className="rounded-xl border border-primary/15 bg-primary/5 px-3 py-2.5">
                        <div className="text-[0.62rem] font-bold uppercase tracking-wide text-muted-foreground">{metric.label}</div>
                        <div className="mt-1 text-base font-black text-primary">{metric.value}</div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-5">
                    {[
                      { label: 'Taxa de resposta', rate: commercialIndicators.totals.rates.response, detail: 'responderam / contatados' },
                      { label: 'Taxa de agendamento', rate: commercialIndicators.totals.rates.scheduling, detail: 'agendados / recebidos' },
                      { label: 'Taxa de comparecimento', rate: commercialIndicators.totals.rates.attendance, detail: 'compareceram / desfechos de presença' },
                      { label: 'Taxa de fechamento', rate: commercialIndicators.totals.rates.closing, detail: 'fechou / desfechos comerciais' },
                      { label: 'SLA de 15 minutos', rate: commercialIndicators.totals.rates.sla15, detail: '1ª resposta no SLA / contatados' },
                    ].map(({ label, rate, detail }) => (
                      <div key={label} className="rounded-xl border border-border/40 bg-background/50 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[0.68rem] font-bold text-foreground">{label}</span>
                          <strong className="text-sm text-primary">{rate.percentage}%</strong>
                        </div>
                        <div className="mt-1 text-[0.6rem] text-muted-foreground">
                          {rate.numerator}/{rate.denominator} · {detail}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2 rounded-xl border border-border/40 bg-background/40 px-3 py-2 text-[0.64rem] font-semibold text-muted-foreground">
                    <span>Campanha classificada: <strong className="text-foreground">{commercialIndicators.coverage.campaignClassified}</strong></span>
                    <span>· Sem campanha: <strong className="text-foreground">{commercialIndicators.coverage.campaignUnclassified}</strong></span>
                    <span>· Com responsável: <strong className="text-foreground">{commercialIndicators.coverage.assigned}</strong></span>
                    <span>· Sem responsável: <strong className="text-foreground">{commercialIndicators.coverage.unassigned}</strong></span>
                    <span title="Somente estes registros podem alimentar o funil de agenda">
                      · Agendamentos vinculados à coorte: <strong className="text-foreground">{commercialIndicators.coverage.appointmentsLinkedToCohort}</strong>
                    </span>
                    <span>· Avaliações criadas no período com marcador: <strong className="text-foreground">{commercialIndicators.coverage.appointmentsWithMarker}</strong></span>
                    <span title="Avaliações criadas no período sem o marcador [pipelineDealId] ficam fora das conversões">
                      · Criadas sem marcador: <strong className="text-foreground">{commercialIndicators.coverage.appointmentsWithoutMarker}</strong>
                    </span>
                  </div>

                  {commercialIndicators.totals.received === 0 ? (
                    <div className="mt-3 rounded-xl border border-border/40 bg-background/40 px-4 py-8 text-center text-sm text-muted-foreground">
                      Nenhum lead qualificado encontrado no período selecionado.
                    </div>
                  ) : (
                    <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-2">
                      <CommercialBreakdownTable title="Por campanha" icon="campaign" rows={commercialIndicators.byCampaign} />
                      <CommercialBreakdownTable title="Por responsável atual" icon="support_agent" rows={commercialIndicators.byAssignee} />
                    </div>
                  )}
                </>
              ) : null}
            </section>

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

            {/* ── Horários de maior receptividade ── */}
            <div className="rounded-xl border border-border/50 bg-card p-4 shadow-sm mb-3">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: 7 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#10b981' }}>schedule</span>
                    Receptividade por Horário
                  </h3>
                  <p style={{ margin: '5px 0 0', fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                    Horários com maior entrada de leads CTWA nos dias com registro do mês selecionado.
                  </p>
                </div>
                {bestHourlyWindow && (
                  <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-right">
                    <div className="text-[0.62rem] font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-400">Pico geral</div>
                    <div className="text-sm font-black text-foreground">
                      {bestHourlyWindow.day} · {String(bestHourlyWindow.hour).padStart(2, '0')}h
                    </div>
                    <div className="text-[0.68rem] font-bold text-muted-foreground">
                      {bestHourlyWindow.weekday} · {bestHourlyWindow.count} leads
                    </div>
                  </div>
                )}
              </div>

              {hourlyDaysWithLeads.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '34px 0', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                  Nenhum lead CTWA encontrado para o mês selecionado.
                </div>
              ) : (
                <div className="flex snap-x gap-3 overflow-x-auto pb-2 pr-2 [scrollbar-width:thin]">
                  {hourlyDaysWithLeads.map(day => (
                    <div key={day.key} className="w-[232px] shrink-0 snap-start rounded-xl border border-border/40 bg-background/60 p-3">
                      <div className="mb-3 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <span className="block text-sm font-black text-foreground">{day.label}</span>
                          <span className="block text-[0.62rem] font-bold uppercase text-muted-foreground">{day.weekday}</span>
                        </div>
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[0.65rem] font-bold text-muted-foreground">
                          {day.total} leads
                        </span>
                      </div>
                      <div className="flex h-[138px] items-end gap-1.5">
                        {day.topHours.map(item => {
                          const height = Math.max(18, (item.count / maxHourlyLeadCount) * 118);
                          return (
                            <div key={item.hour} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                              <span className="text-[0.65rem] font-black text-primary">{item.count}</span>
                              <div
                                className="w-full rounded-t-md bg-gradient-to-t from-primary to-pink-500 shadow-[0_0_18px_rgba(139,92,246,0.18)]"
                                style={{ height }}
                                title={`${day.label} ${String(item.hour).padStart(2, '0')}h: ${item.count} leads`}
                              />
                              <span className="text-[0.58rem] font-bold text-muted-foreground">{String(item.hour).padStart(2, '0')}h</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
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
                {funnelStages.map(s => {
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
