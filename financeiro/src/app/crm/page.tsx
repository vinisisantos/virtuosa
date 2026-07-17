"use client";

import { useCallback, useEffect, useState, useRef } from "react";
import Link from "next/link";
import {
  MessageSquare,
  DollarSign,
  Bell,
  Trophy,
  RefreshCw,
  TrendingUp,
  ArrowRight,
  AlertTriangle,
} from "lucide-react";
import { useGlobalUnit } from "@/contexts/UnitContext";
import { DatePicker } from "@/components/ui/date-picker";

// ─── Types ───────────────────────────────────────────────────
interface MetricsBundle {
  activeConversations: { current: number; previous: number };
  unreadConversations: number;
  openDealsValue: number;
  openDealsCount: number;
  wonDealsValue: number;
  wonDealsCount: number;
}

interface PipelineStage {
  stage: string;
  label: string;
  count: number;
  value: number;
  color: string;
}

interface LeadsPoint {
  date: string;
  newLeads: number;
}

interface DashboardData {
  metrics: MetricsBundle;
  pipeline: PipelineStage[];
  leadsSeries: LeadsPoint[];
  whatsapp?: WhatsAppStatus;
}

interface WhatsAppDisconnectedInstance {
  id: string;
  instanceId: string | null;
  name: string;
  unit: string | null;
  phoneNumber: string | null;
  provider: string | null;
  ownerName: string | null;
}

interface WhatsAppStatus {
  connectedCount: number;
  connectingCount: number;
  disconnectedCount: number;
  disconnectedInstances: WhatsAppDisconnectedInstance[];
}

// ─── Helpers ─────────────────────────────────────────────────
function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatCurrencyShort(value: number): string {
  if (Math.abs(value) >= 1000) {
    return "R$ " + (value / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " mil";
  }
  return formatCurrency(value);
}

function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return "0%";
  return `${Math.round(value)}%`;
}

function normalizeStageName(name?: string | null): string {
  return (name || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, "_");
}

function isClosedStage(stage: PipelineStage): boolean {
  return ["fechado", "perdido", "finalizado", "encerrado", "descartado", "sem_retorno", "nao_viavel"].includes(
    normalizeStageName(stage.label || stage.stage),
  );
}

function formatChartDate(date: string): string {
  const [year, month, day] = date.split("-");
  return `${day}/${month}/${year}`;
}

function chartMaxWithHeadroom(value: number): number {
  const safeValue = Number.isFinite(value) ? Math.max(value, 0) : 0;
  if (safeValue === 0) return 1;
  return safeValue * 1.1;
}

function formatAxisLabel(value: number): string {
  if (value >= 10) return Math.round(value).toLocaleString("pt-BR");
  if (Number.isInteger(value)) return value.toLocaleString("pt-BR");
  return value.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
}

function formatDateInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// ─── Area Chart SVG ──────────────────────────────────────────
function AreaChart({
  series,
  selectedDate,
  onSelectDate,
}: {
  series: LeadsPoint[];
  selectedDate?: string | null;
  onSelectDate: (date: string) => void;
}) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      // Dá um scroll instantâneo para o final (direita)
      scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
    }
  }, [series]);

  if (!series || series.length === 0) return (
    <div className="flex h-[140px] items-center justify-center text-sm text-muted-foreground">
      Sem dados de leads neste período
    </div>
  );

  const data = series;
  const maxVal = chartMaxWithHeadroom(Math.max(...data.map(p => p.newLeads), 0));

  const minPointWidth = 38;
  const W = Math.max(860, data.length * minPointWidth);
  const H = 96;
  const paddingX = 48;
  const paddingYTop = 16;
  const baselineY = paddingYTop + H;
  const chartHeight = H + paddingYTop + 30;
  const selectedIndex = selectedDate ? data.findIndex((point) => point.date === selectedDate) : -1;
  const activeIndex = hoveredIndex ?? (selectedIndex >= 0 ? selectedIndex : data.length - 1);

  const pts = data.map((p, i) => {
    const x = paddingX + (i / Math.max(data.length - 1, 1)) * (W - paddingX * 2);
    const y = paddingYTop + (H - (p.newLeads / maxVal) * H);
    return { x, y, ...p };
  });

  const activePoint = pts[activeIndex];
  const tooltipWidth = 154;
  const tooltipHeight = 58;
  const tooltipGap = 12;
  const tooltipLeft = activePoint
    ? Math.min(
        Math.max(
          activePoint.x > W / 2
            ? activePoint.x - tooltipGap - tooltipWidth
            : activePoint.x + tooltipGap,
          8,
        ),
        W - tooltipWidth - 8,
      )
    : 0;
  const tooltipTop = activePoint
    ? Math.min(
        Math.max(
          activePoint.y - tooltipHeight - tooltipGap < 8
            ? activePoint.y + tooltipGap
            : activePoint.y - tooltipHeight - tooltipGap,
          8,
        ),
        chartHeight - tooltipHeight - 8,
      )
    : 0;
  const pathD = `M${pts.map(p => `${p.x},${p.y}`).join(" L")}`;
  const areaD = `M${pts[0]?.x || 0},${baselineY} L${pts.map(p => `${p.x},${p.y}`).join(" L")} L${pts[pts.length - 1]?.x || W},${baselineY} Z`;

  return (
    <div ref={scrollRef} className="relative h-[150px] w-full overflow-x-auto overflow-y-visible custom-scrollbar scroll-smooth">
        <div style={{ width: W, height: chartHeight }} className="relative min-w-full">
          <svg viewBox={`0 0 ${W} ${chartHeight}`} className="w-full h-full overflow-visible">
          <defs>
            <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="currentColor" className="text-primary" stopOpacity="0.36" />
              <stop offset="100%" stopColor="currentColor" className="text-primary" stopOpacity="0.03" />
            </linearGradient>
          </defs>

          {[0, 0.25, 0.5, 0.75, 1].map(f => {
            const gridY = paddingYTop + H * (1 - f);
            const label = formatAxisLabel(maxVal * f);
            return (
              <g key={f}>
                <line x1={paddingX} y1={gridY} x2={W - paddingX} y2={gridY} stroke="currentColor" className="text-border" strokeWidth={1} strokeDasharray={f === 0 ? "0" : "4 6"} opacity={f === 0 ? 0.8 : 0.55} />
                <text x={paddingX - 12} y={gridY + 4} textAnchor="end" fontSize={10} fill="currentColor" className="text-muted-foreground">{label}</text>
              </g>
            );
          })}

          {pts.map((p, i) => {
            const barW = 10;
            const isToday = i === pts.length - 1;
            const height = Math.max(baselineY - p.y, p.newLeads > 0 ? 3 : 0);
            return (
              <rect
                key={`bar-${i}`}
                x={p.x - barW / 2}
                y={baselineY - height}
                width={barW}
                height={height}
                rx={4}
                fill="currentColor"
                className={isToday ? "text-primary" : "text-primary/45"}
                opacity={p.newLeads > 0 ? (isToday ? 0.32 : 0.18) : 0}
              />
            );
          })}

          <path d={areaD} fill="url(#areaGrad)" />
          <path d={pathD} stroke="currentColor" className="text-primary" strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />

          {pts.map((p, i) => {
            if (i % 5 !== 0 && i !== pts.length - 1 && i !== 0) return null;
            const label = p.date.slice(5).replace("-", "/");
            return <text key={`label-${i}`} x={p.x} y={baselineY + 22} textAnchor="middle" fontSize={11} fill="currentColor" className={i === pts.length - 1 ? "text-foreground" : "text-muted-foreground"}>{label}</text>;
          })}

          {pts.map((p, i) => (
            <g
              key={`pt-${i}`}
              onMouseEnter={() => setHoveredIndex(i)}
              onMouseLeave={() => setHoveredIndex(null)}
              onClick={() => onSelectDate(p.date)}
              onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                onSelectDate(p.date);
              }}
              tabIndex={0}
              role="button"
              aria-label={`Carregar indicadores de ${formatChartDate(p.date)}`}
              className="cursor-pointer"
            >
              <circle cx={p.x} cy={p.y} r={20} fill="transparent" />
              <circle
                cx={p.x}
                cy={p.y}
                r={activeIndex === i ? 6 : 4}
                fill="currentColor"
                className={`text-background stroke-primary ${activeIndex === i ? "stroke-[3px]" : "stroke-2"} transition-all`}
              />
              {(i === pts.length - 1 || p.date === selectedDate) && (
                <circle cx={p.x} cy={p.y} r={11} fill="none" stroke="currentColor" className="text-primary" strokeWidth={1.5} opacity={0.45} />
              )}
            </g>
          ))}
        </svg>

          {activePoint && (
            <div
              className="absolute z-50 pointer-events-none w-[154px] rounded-lg border border-border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-lg"
              style={{ left: tooltipLeft, top: tooltipTop }}
            >
              <span className="block font-semibold text-muted-foreground">{formatChartDate(activePoint.date)}</span>
              <span className="block text-base font-bold text-primary">{activePoint.newLeads} {activePoint.newLeads === 1 ? "novo lead" : "novos leads"}</span>
            </div>
          )}
        </div>
    </div>
  );
}

// ─── Pipeline Funnel ─────────────────────────────────────────
function PipelineFunnel({ data }: { data: PipelineStage[] | null }) {
  const totalCount = data?.reduce((s, d) => s + d.count, 0) || 0;
  const stages = data || [];
  const totalValue = stages.filter((stage) => !isClosedStage(stage)).reduce((s, d) => s + d.value, 0);
  const transitions = stages.slice(0, -1).map((stage, index) => {
    const next = stages[index + 1];
    const rate = stage.count > 0 ? (next.count / stage.count) * 100 : 0;
    const delta = next.count - stage.count;
    return { from: stage, to: next, rate, delta };
  });
  const bottleneck = transitions
    .filter((transition) => transition.from.count > 0 && transition.delta < 0)
    .sort((a, b) => a.rate - b.rate)[0];

  return (
    <div className="p-6">
      <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Funil de Conversão
          </p>
          <p className="text-sm font-medium text-muted-foreground">Passagem entre etapas com a base atual do pipeline</p>
        </div>
        <div className="text-right">
          <span className="text-xs text-muted-foreground block">Valor total aberto</span>
          <span className="text-lg font-bold text-foreground">{formatCurrency(totalValue)}</span>
        </div>
      </div>

      {totalCount === 0 || !data ? (
        <p className="text-sm text-muted-foreground text-center py-8">Nenhum negócio no funil</p>
      ) : (
        <div className="space-y-5">
          <div className="grid gap-3 xl:grid-cols-[repeat(9,minmax(0,1fr))]">
            {stages.map((stage, index) => {
              const active = stage.count > 0;
              const transition = transitions[index];

              return (
                <div key={stage.stage} className="contents">
                  <div className="rounded-xl border border-border/60 bg-background/45 p-4">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{
                          backgroundColor: active ? stage.color : "transparent",
                          boxShadow: active ? `0 0 14px ${stage.color}70` : "none",
                          border: active ? "none" : "1px solid var(--border)",
                        }}
                      />
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
                        {index + 1}
                      </span>
                    </div>
                    <span className={`block text-2xl font-bold tabular-nums ${active ? "text-foreground" : "text-muted-foreground"}`}>
                      {stage.count}
                    </span>
                    <span className="mt-1 block truncate text-xs font-semibold text-muted-foreground">
                      {stage.label}
                    </span>
                    <span className="mt-3 block text-[11px] font-medium text-muted-foreground">
                      {formatCurrencyShort(stage.value)}
                    </span>
                  </div>

                  {transition && (
                    <div className="flex items-center justify-center">
                      <div className="flex w-full items-center gap-2 rounded-xl border border-border/50 bg-background/25 px-3 py-2 xl:flex-col xl:gap-1 xl:px-2">
                        <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground xl:rotate-0" />
                        <div className="min-w-0 flex-1 text-left xl:text-center">
                          <span className={`block text-sm font-bold tabular-nums ${
                            transition.delta < 0
                              ? "text-amber-400"
                              : transition.delta > 0
                              ? "text-emerald-400"
                              : "text-muted-foreground"
                          }`}>
                            {formatPercent(transition.rate)}
                          </span>
                          <span className="block truncate text-[10px] font-medium text-muted-foreground">
                            {transition.delta < 0
                              ? `${Math.abs(transition.delta)} ficam antes`
                              : transition.delta > 0
                              ? `+${transition.delta} acumulado`
                              : "sem variação"}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {bottleneck ? (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm">
              <AlertTriangle className="h-4 w-4 text-amber-400" />
              <span className="font-semibold text-foreground">Maior gargalo:</span>
              <span className="text-muted-foreground">
                {bottleneck.from.label} → {bottleneck.to.label}, com {formatPercent(bottleneck.rate)} de passagem.
              </span>
            </div>
          ) : (
            <div className="rounded-xl border border-border/50 bg-background/25 px-4 py-3 text-sm text-muted-foreground">
              Nenhuma queda entre etapas nesta base atual.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── KPI Card ────────────────────────────────────────────────
function KpiCard({
  label, value, subtitle, icon: Icon
}: {
  label: string; value: string; subtitle?: string; icon: typeof MessageSquare;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2 rounded-xl border border-border/50 bg-card p-3 shadow-sm sm:gap-3 sm:p-5">
      <div className="flex items-center gap-2 sm:mb-1">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary sm:h-8 sm:w-8">
          <Icon className="h-4 w-4" />
        </div>
        <span className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground sm:text-xs sm:tracking-widest">
          {label}
        </span>
      </div>
      <span className="text-2xl font-bold tabular-nums leading-none tracking-tight text-foreground sm:text-4xl">
        {value}
      </span>
      {subtitle && (
        <span className="line-clamp-2 text-[10px] leading-snug text-muted-foreground sm:text-xs">{subtitle}</span>
      )}
    </div>
  );
}

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-muted ${className}`} />;
}

function LeadsSummaryCards({
  series,
  loading,
  selectedDate,
  totalLabel,
}: {
  series: LeadsPoint[];
  loading: boolean;
  selectedDate?: string | null;
  totalLabel: string;
}) {
  if (loading) {
    return (
      <div className="grid w-full grid-cols-2 gap-2 sm:w-auto sm:shrink-0">
        <Skeleton className="h-[58px] w-[78px] rounded-lg" />
        <Skeleton className="h-[58px] w-[78px] rounded-lg" />
      </div>
    );
  }

  const referencePoint = selectedDate
    ? series.find((point) => point.date === selectedDate)
    : series[series.length - 1];
  const monthLeads = series.reduce((sum, point) => sum + point.newLeads, 0);

  return (
    <div className="grid w-full grid-cols-2 gap-2 sm:w-auto sm:shrink-0">
      <div className="min-w-[78px] rounded-lg border border-border/60 bg-background/40 px-3 py-2">
        <span className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {selectedDate ? "Dia" : "Hoje"}
        </span>
        <span className="text-lg font-bold leading-tight text-foreground">{referencePoint?.newLeads ?? 0}</span>
      </div>
      <div className="min-w-[78px] rounded-lg border border-border/60 bg-background/40 px-3 py-2">
        <span className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{totalLabel}</span>
        <span className="text-lg font-bold leading-tight text-foreground">{monthLeads}</span>
      </div>
    </div>
  );
}

function whatsappInstanceLabel(instance: WhatsAppDisconnectedInstance) {
  const pieces = [
    instance.ownerName,
    instance.unit,
    instance.phoneNumber ? `+${instance.phoneNumber}` : null,
  ].filter(Boolean);

  return pieces.length ? pieces.join(" · ") : instance.name;
}

function WhatsAppConnectionAlert({ whatsapp }: { whatsapp?: WhatsAppStatus | null }) {
  const disconnected = whatsapp?.disconnectedInstances || [];
  if (disconnected.length === 0) return null;

  const names = disconnected.slice(0, 3).map(whatsappInstanceLabel).join(", ");
  const extraCount = disconnected.length > 3 ? disconnected.length - 3 : 0;
  const details = disconnected.length === 1
    ? `${names} está sem conexão. Enquanto isso, o Inbox pode receber atrasos e os envios podem falhar.`
    : `${disconnected.length} WhatsApps estão sem conexão: ${names}${extraCount > 0 ? ` e mais ${extraCount}` : ""}.`;

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:p-4">
      <div className="flex min-w-0 items-start gap-2.5 sm:gap-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-300 sm:h-9 sm:w-9">
          <AlertTriangle className="h-4 w-4 sm:h-5 sm:w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold text-foreground">
            WhatsApp desconectado
          </p>
          <p className="mt-0.5 text-xs font-medium leading-relaxed text-muted-foreground sm:mt-1 sm:text-sm">
            {details}
          </p>
        </div>
      </div>
      <Link
        href="/configuracoes/whatsapp"
        className="inline-flex h-8 shrink-0 self-end items-center justify-center rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 text-xs font-bold text-amber-200 transition-colors hover:bg-amber-500/20 sm:h-9 sm:self-auto sm:text-sm"
      >
        Reconectar
      </Link>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════
// ─── Main Dashboard Page ─────────────────────────────────────
// ═════════════════════════════════════════════════════════════
export default function CRMDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [userName, setUserName] = useState("Usuário");
  const [startDate, setStartDate] = useState(() => formatDateInput(new Date()));
  const [startTime, setStartTime] = useState("00:00");
  const [endDate, setEndDate] = useState(() => formatDateInput(new Date()));
  const [endTime, setEndTime] = useState("23:59");
  const [periodFilterActive, setPeriodFilterActive] = useState(false);
  const [selectedChartDate, setSelectedChartDate] = useState<string | null>(null);

  const { globalUnit } = useGlobalUnit();
  useEffect(() => {
    try {
      const raw = localStorage.getItem("virtuosa_user");
      if (raw) {
        const user = JSON.parse(raw);
        if (user.name) setUserName(user.name.split(" ")[0]);
      }
    } catch {}
  }, []);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (globalUnit) params.set("unit", globalUnit);
      if (periodFilterActive) {
        if (startDate) params.set("startDate", startDate);
        if (startTime) params.set("startTime", startTime);
        if (endDate) params.set("endDate", endDate);
        if (endTime) params.set("endTime", endTime);
      }
      if (selectedChartDate) params.set("chartMode", "month");
      const qs = params.toString();
      const res = await fetch(qs ? `/api/crm/dashboard?${qs}` : "/api/crm/dashboard", {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Failed to fetch");
      setData(await res.json());
      setLastUpdated(new Date());
    } catch (err) {
      console.error("[CRM Dashboard]", err);
    } finally {
      setLoading(false);
    }
  }, [globalUnit, periodFilterActive, startDate, startTime, endDate, endTime, selectedChartDate]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const m = data?.metrics;
  const leadsTotalLabel = periodFilterActive ? "Período" : "Mês";
  const leadsDescription = selectedChartDate
    ? `Volume diário de leads no mês; indicadores filtrados em ${formatChartDate(selectedChartDate)}`
    : periodFilterActive
    ? "Volume diário de leads recebidos no período selecionado"
    : "Volume diário de leads recebidos no mês corrente";
  const selectChartDate = (date: string) => {
    setSelectedChartDate(date);
    setStartDate(date);
    setStartTime("00:00");
    setEndDate(date);
    setEndTime("23:59");
    setPeriodFilterActive(true);
  };
  const clearChartSelection = () => {
    const today = formatDateInput(new Date());
    setSelectedChartDate(null);
    setStartDate(today);
    setStartTime("00:00");
    setEndDate(today);
    setEndTime("23:59");
    setPeriodFilterActive(false);
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-8 sm:space-y-10 sm:pb-12">
      <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200" rel="stylesheet" />

      {/* Greeting Header */}
      <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-4 sm:pt-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-[28px]">
            Olá, {userName}! 👋
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground sm:text-sm">
            <span>Resumo da operação {globalUnit && globalUnit !== "all" ? `em ${globalUnit}` : "global"}.</span>
            {lastUpdated && (
              <>
                <span className="hidden sm:inline">·</span>
                <span className="flex items-center gap-1.5">
                  <RefreshCw className={`h-3 w-3 cursor-pointer hover:text-foreground ${loading ? "animate-spin" : ""}`} onClick={loadDashboard} />
                  Atualizado às {lastUpdated.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                </span>
              </>
            )}
          </div>
        </div>
        <div className="grid w-full grid-cols-2 items-end gap-2 rounded-xl border border-border/50 bg-card p-3 shadow-sm sm:flex sm:w-auto sm:flex-wrap sm:gap-4">
          <div className="min-w-0 sm:min-w-[140px]">
            <label className="mb-1 flex items-center gap-1.5 text-[0.65rem] font-bold uppercase tracking-wider text-muted-foreground/80">
              <span className="material-symbols-outlined text-[14px]">date_range</span>
              Período Inicial
            </label>
            <DatePicker
              value={startDate}
              onChange={(value) => {
                setSelectedChartDate(null);
                setPeriodFilterActive(true);
                setStartDate(value);
              }}
              variant="compact"
              calendarSize="small"
              placeholder="Data inicial"
            />
            <input
              type="time"
              value={startTime}
              onChange={(event) => {
                setSelectedChartDate(null);
                setPeriodFilterActive(true);
                setStartTime(event.target.value);
              }}
              className="mt-2 h-9 w-full rounded-lg border border-border/60 bg-background px-2 text-xs font-semibold text-foreground outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary/40 sm:px-3 sm:text-sm"
            />
          </div>
          <div className="min-w-0 sm:min-w-[140px]">
            <label className="mb-1 flex items-center gap-1.5 text-[0.65rem] font-bold uppercase tracking-wider text-muted-foreground/80">
              <span className="material-symbols-outlined text-[14px]">event</span>
              Período Final
            </label>
            <DatePicker
              value={endDate}
              onChange={(value) => {
                setSelectedChartDate(null);
                setPeriodFilterActive(true);
                setEndDate(value);
              }}
              variant="compact"
              calendarSize="small"
              placeholder="Data final"
            />
            <input
              type="time"
              value={endTime}
              onChange={(event) => {
                setSelectedChartDate(null);
                setPeriodFilterActive(true);
                setEndTime(event.target.value);
              }}
              className="mt-2 h-9 w-full rounded-lg border border-border/60 bg-background px-2 text-xs font-semibold text-foreground outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary/40 sm:px-3 sm:text-sm"
            />
          </div>
        </div>
      </div>

      <WhatsAppConnectionAlert whatsapp={data?.whatsapp} />

      {/* ── KPIs ──────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-2 sm:gap-4 lg:grid-cols-4">
        {loading || !m ? (
          [0, 1, 2, 3].map(i => (
            <div key={i} className="min-w-0 flex-1 rounded-xl border border-border/50 bg-card p-3 shadow-sm sm:p-5">
              <Skeleton className="mb-3 h-7 w-7 rounded-lg sm:mb-4 sm:h-8 sm:w-8" />
              <Skeleton className="mb-2 h-7 w-20 sm:mb-3 sm:h-10 sm:w-24" />
              <Skeleton className="h-3 w-32" />
            </div>
          ))
        ) : (
          <>
            <KpiCard
              label="Conversas ativas"
              value={m.activeConversations.current.toLocaleString()}
              icon={MessageSquare}
              subtitle={
                m.activeConversations.current === 1
                  ? "1 conversa aberta no período"
                  : `${m.activeConversations.current} conversas abertas no período`
              }
            />
            <KpiCard
              label="Aguardando resposta"
              value={m.unreadConversations.toLocaleString()}
              icon={Bell}
              subtitle={
                m.unreadConversations === 1
                  ? "1 conversa com mensagem não lida"
                  : `${m.unreadConversations} conversas com mensagens não lidas`
              }
            />
            <KpiCard
              label="Pipeline aberto"
              value={formatCurrencyShort(m.openDealsValue)}
              icon={DollarSign}
              subtitle={`${m.openDealsCount} negócio${m.openDealsCount === 1 ? "" : "s"} aberto${m.openDealsCount === 1 ? "" : "s"}`}
            />
            <KpiCard
              label="Negócios Ganhos"
              value={formatCurrencyShort(m.wonDealsValue)}
              icon={Trophy}
              subtitle={`${m.wonDealsCount} negócio${m.wonDealsCount === 1 ? " fechado" : "s fechados"} no período`}
            />
          </>
        )}
      </div>

      {/* ── Charts & Pipeline ─────────────────────────── */}
      <div className="space-y-6">

        {/* Area Chart: Leads */}
        <div className="rounded-xl border border-border/50 bg-card p-4 shadow-sm sm:p-5">
          <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                <div className="flex h-6 w-6 items-center justify-center rounded bg-primary/10 text-primary">
                  <TrendingUp className="h-3.5 w-3.5" />
                </div>
                Entrada de Novos Leads
              </div>
              <p className="mt-1 text-sm font-medium text-muted-foreground">{leadsDescription}</p>
              {selectedChartDate && (
                <button
                  type="button"
                  onClick={clearChartSelection}
                  className="mt-2 text-xs font-semibold text-primary transition-colors hover:text-primary/80"
                >
                  Indicadores de {formatChartDate(selectedChartDate)} · Voltar para hoje
                </button>
              )}
            </div>
            <LeadsSummaryCards
              series={data?.leadsSeries || []}
              loading={loading}
              selectedDate={selectedChartDate}
              totalLabel={selectedChartDate ? "Mês" : leadsTotalLabel}
            />
          </div>
          {loading ? (
            <Skeleton className="h-[150px] w-full" />
          ) : (
            <AreaChart
              series={data?.leadsSeries || []}
              selectedDate={selectedChartDate}
              onSelectDate={selectChartDate}
            />
          )}
        </div>

        <div className="h-8" />

        {/* Full-width Pipeline Funnel */}
        <div className="bg-card border border-border/50 rounded-xl shadow-sm">
          {loading ? (
            <div className="p-6">
              <Skeleton className="h-6 w-48 mb-8" />
              <div className="flex justify-between">
                {[0, 1, 2, 3, 4, 5, 6].map(i => <Skeleton key={i} className="h-10 w-16" />)}
              </div>
            </div>
          ) : (
            <PipelineByStage data={data?.pipeline || null} />
          )}
        </div>

      </div>
    </div>
  );
}

// Wrapper local functions
function PipelineByStage({ data }: { data: PipelineStage[] | null }) {
  return <PipelineFunnel data={data} />;
}
