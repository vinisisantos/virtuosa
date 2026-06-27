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
} from "lucide-react";
import { useGlobalUnit } from "@/contexts/UnitContext";

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

// ─── Area Chart SVG ──────────────────────────────────────────
function AreaChart({ series }: { series: LeadsPoint[] }) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      // Dá um scroll instantâneo para o final (direita)
      scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
    }
  }, [series]);

  if (!series || series.length === 0) return (
    <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">
      Sem dados de leads neste período
    </div>
  );

  const data = series;
  const maxVal = Math.max(...data.map(p => p.newLeads), 1);

  const minPointWidth = 40;
  const W = Math.max(800, data.length * minPointWidth);
  const H = 160;

  // Margens internas para o tooltip não cortar e as bolinhas não sumirem nas bordas
  const paddingX = 24;
  const paddingYTop = 72;

  const pts = data.map((p, i) => {
    const x = paddingX + (i / Math.max(data.length - 1, 1)) * (W - paddingX * 2);
    // Inverte o Y: valor máximo fica no topo (paddingYTop), valor 0 fica na base (paddingYTop + H)
    const y = paddingYTop + (H - (p.newLeads / maxVal) * H);
    return { x, y, ...p };
  });

  const pathD = `M${pts.map(p => `${p.x},${p.y}`).join(" L")}`;
  // A área desce até a base do gráfico (H + paddingYTop)
  const areaD = `M${pts[0]?.x || 0},${H + paddingYTop} L${pts.map(p => `${p.x},${p.y}`).join(" L")} L${pts[pts.length - 1]?.x || W},${H + paddingYTop} Z`;

  return (
    <div ref={scrollRef} className="w-full h-[280px] overflow-x-auto overflow-y-hidden relative custom-scrollbar scroll-smooth">
      <div style={{ width: W, height: H + paddingYTop + 40 }} className="relative min-w-full px-4 pt-4">
        <svg viewBox={`0 0 ${W} ${H + paddingYTop + 40}`} className="w-full h-full overflow-visible">
          <defs>
            <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="currentColor" className="text-primary" stopOpacity="0.5" />
              <stop offset="100%" stopColor="currentColor" className="text-primary" stopOpacity="0.03" />
            </linearGradient>
          </defs>

          {/* Linhas de Grade */}
          {[0.25, 0.5, 0.75, 1].map(f => {
            const gridY = paddingYTop + H * (1 - f);
            return <line key={f} x1={paddingX} y1={gridY} x2={W - paddingX} y2={gridY} stroke="currentColor" className="text-border" strokeWidth={1} strokeDasharray="4 4" />;
          })}

          <path d={areaD} fill="url(#areaGrad)" />
          <path d={pathD} stroke="currentColor" className="text-primary" strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />

          {/* Eixo X - Exibir algumas datas para não encavalar */}
          {pts.map((p, i) => {
            if (i % 5 !== 0 && i !== pts.length - 1 && i !== 0) return null;
            const label = p.date.slice(5).replace("-", "/");
            return <text key={`label-${i}`} x={p.x} y={H + paddingYTop + 20} textAnchor="middle" fontSize={11} fill="currentColor" className="text-muted-foreground">{label}</text>;
          })}

          {/* Pontos interativos */}
          {pts.map((p, i) => (
            <g
              key={`pt-${i}`}
              onMouseEnter={() => setHoveredIndex(i)}
              onMouseLeave={() => setHoveredIndex(null)}
              className="cursor-pointer"
            >
              <circle cx={p.x} cy={p.y} r={20} fill="transparent" />
              <circle
                cx={p.x}
                cy={p.y}
                r={hoveredIndex === i ? 6 : 4}
                fill="currentColor"
                className={`text-background stroke-primary ${hoveredIndex === i ? "stroke-[3px]" : "stroke-2"} transition-all`}
              />
            </g>
          ))}
        </svg>

        {/* Tooltip */}
        {hoveredIndex !== null && (
          <div
            className="absolute z-10 pointer-events-none bg-popover text-popover-foreground border border-border shadow-lg rounded-lg px-3 py-2 text-xs flex flex-col gap-1 whitespace-nowrap transform -translate-x-1/2 -translate-y-full animate-in fade-in zoom-in-95 duration-200"
            style={{ left: pts[hoveredIndex].x, top: pts[hoveredIndex].y - 12 }}
          >
            <span className="font-semibold text-muted-foreground">{pts[hoveredIndex].date.split("-").reverse().join("/")}</span>
            <span className="font-bold text-sm text-primary">{pts[hoveredIndex].newLeads} novos leads</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Pipeline Funnel ─────────────────────────────────────────
function PipelineFunnel({ data }: { data: PipelineStage[] | null }) {
  const totalCount = data?.reduce((s, d) => s + d.count, 0) || 0;
  const totalValue = data?.reduce((s, d) => s + d.value, 0) || 0;

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-8">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Funil de Vendas
          </p>
          <p className="text-sm font-medium text-muted-foreground">Negócios abertos por etapa</p>
        </div>
        <div className="text-right">
          <span className="text-xs text-muted-foreground block">Valor total aberto</span>
          <span className="text-lg font-bold text-foreground">{formatCurrency(totalValue)}</span>
        </div>
      </div>

      {totalCount === 0 || !data ? (
        <p className="text-sm text-muted-foreground text-center py-8">Nenhum negócio no funil</p>
      ) : (
        <div className="px-4">
          <div className="relative flex items-center justify-between mb-4">
            <div className="absolute inset-x-0 top-1/2 h-px bg-border -z-10" />
            {data.map((stage) => {
              const active = stage.count > 0;
              return (
                <div key={stage.stage} className="relative flex flex-col items-center gap-3 bg-background px-2">
                  <div
                    className="w-4 h-4 rounded-full border-4 transition-all"
                    style={{
                      backgroundColor: active ? stage.color : "transparent",
                      borderColor: active ? stage.color : "var(--border)",
                      boxShadow: active ? `0 0 12px ${stage.color}40` : "none",
                    }}
                  />
                </div>
              );
            })}
          </div>

          <div className="flex items-start justify-between">
            {data.map((stage) => {
              const active = stage.count > 0;
              return (
                <div key={stage.stage} className="flex flex-col items-center gap-1 text-center flex-1">
                  <span className={`text-sm font-bold ${active ? "text-foreground" : "text-muted-foreground"}`}>
                    {stage.count}
                  </span>
                  <span className="text-[11px] leading-tight text-muted-foreground mb-1">
                    {stage.label}
                  </span>
                  {active && (
                    <span className="text-[10px] font-medium text-foreground">
                      {formatCurrencyShort(stage.value)}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
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
    <div className="flex flex-col gap-3 p-5 flex-1 min-w-[200px] bg-card border border-border/50 rounded-xl shadow-sm">
      <div className="flex items-center gap-2 mb-1">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </div>
        <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          {label}
        </span>
      </div>
      <span className="text-4xl font-bold tabular-nums leading-none tracking-tight text-foreground">
        {value}
      </span>
      {subtitle && (
        <span className="text-xs text-muted-foreground">{subtitle}</span>
      )}
    </div>
  );
}

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-muted ${className}`} />;
}

// ═════════════════════════════════════════════════════════════
// ─── Main Dashboard Page ─────────────────────────────────────
// ═════════════════════════════════════════════════════════════
export default function CRMDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [userName, setUserName] = useState("Usuário");

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
      const qs = params.toString();
      const res = await fetch(qs ? `/api/crm/dashboard?${qs}` : "/api/crm/dashboard");
      if (!res.ok) throw new Error("Failed to fetch");
      setData(await res.json());
      setLastUpdated(new Date());
    } catch (err) {
      console.error("[CRM Dashboard]", err);
    } finally {
      setLoading(false);
    }
  }, [globalUnit]);

  useEffect(() => {
    loadDashboard();

    // Atualização em "tempo real" (polling a cada 15s)
    const interval = setInterval(() => {
      loadDashboard();
    }, 15000);

    return () => clearInterval(interval);
  }, [loadDashboard]);

  const m = data?.metrics;

  return (
    <div className="mx-auto max-w-6xl space-y-10 pb-12">

      {/* Greeting Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 pt-4">
        <div>
          <h1 className="text-[28px] font-bold text-foreground tracking-tight">
            Olá, {userName}! 👋
          </h1>
          <div className="mt-1 flex items-center gap-3 text-sm text-muted-foreground">
            <span>Resumo da operação {globalUnit && globalUnit !== "all" ? `em ${globalUnit}` : "global"}.</span>
            {lastUpdated && (
              <>
                <span>·</span>
                <span className="flex items-center gap-1.5">
                  <RefreshCw className={`h-3 w-3 cursor-pointer hover:text-foreground ${loading ? "animate-spin" : ""}`} onClick={loadDashboard} />
                  Atualizado às {lastUpdated.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── KPIs ──────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {loading || !m ? (
          [0, 1, 2, 3].map(i => (
            <div key={i} className="flex-1 p-5 min-w-[200px] bg-card border border-border/50 rounded-xl shadow-sm">
              <Skeleton className="h-8 w-8 rounded-lg mb-4" />
              <Skeleton className="h-10 w-24 mb-3" />
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
                m.activeConversations.current - m.activeConversations.previous > 0
                  ? `+${m.activeConversations.current - m.activeConversations.previous} abertas hoje`
                  : "Nenhuma nova conversa hoje"
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
              subtitle={`${m.wonDealsCount} negócio${m.wonDealsCount === 1 ? " fechado" : "s fechados"} este mês`}
            />
          </>
        )}
      </div>

      {/* ── Charts & Pipeline ─────────────────────────── */}
      <div className="space-y-6">

        {/* Area Chart: Leads */}
        <div className="bg-card border border-border/50 rounded-xl shadow-sm p-6">
          <div className="mb-6">
            <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground flex items-center gap-2 mb-1">
              <div className="flex items-center justify-center w-6 h-6 rounded bg-primary/10 text-primary">
                <TrendingUp className="h-3.5 w-3.5" />
              </div>
              Entrada de Novos Leads
            </div>
            <p className="text-sm font-medium text-muted-foreground mt-2">Volume diário de novos contatos criados nos últimos 30 dias</p>
          </div>
          {loading ? (
            <Skeleton className="h-48 w-full" />
          ) : (
            <AreaChart series={data?.leadsSeries || []} />
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
