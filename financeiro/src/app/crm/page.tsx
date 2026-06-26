"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  MessageSquare,
  DollarSign,
  ArrowUp,
  ArrowDown,
  Minus,
  Briefcase,
  BarChart3,
  User,
  Clock,
  RefreshCw,
  Bell,
  Trophy,
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

interface ActivityItem {
  id: string;
  userName: string;
  action: string;
  entityType: string;
  description: string;
  createdAt: string;
}

interface ConversationPoint {
  date: string;
  incoming: number;
  outgoing: number;
}

interface DashboardData {
  metrics: MetricsBundle;
  pipeline: PipelineStage[];
  activity: ActivityItem[];
  conversationSeries: ConversationPoint[];
}

// ─── Helpers ─────────────────────────────────────────────────
function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Versão compacta (ex.: R$ 42,5 mil) para números grandes em cards.
function formatCurrencyShort(value: number): string {
  if (Math.abs(value) >= 1000) {
    return "R$ " + (value / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " mil";
  }
  return formatCurrency(value);
}

function deltaLabel(delta: number, suffix: string): string {
  if (delta === 0) return `Sem alteração ${suffix}`;
  const sign = delta > 0 ? "+" : "";
  return `${sign}${delta.toLocaleString()} ${suffix}`;
}

function timeAgo(dateStr: string): string {
  try {
    const now = new Date();
    const d = new Date(dateStr);
    const diffMin = Math.floor((now.getTime() - d.getTime()) / 60000);
    const diffH = Math.floor(diffMin / 60);

    if (diffMin < 1) return "agora";
    if (diffMin < 60) return `${diffMin}m atrás`;
    if (diffH < 24) return `${diffH}h atrás`;

    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dateStart = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const diffDays = Math.round((todayStart.getTime() - dateStart.getTime()) / 86400000);
    const timeStr = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

    if (diffDays === 1) return `ontem ${timeStr}`;
    if (diffDays < 7) {
      const weekday = d.toLocaleDateString("pt-BR", { weekday: "short" });
      return `${weekday} ${timeStr}`;
    }
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  } catch {
    return "";
  }
}

const actionLabels: Record<string, string> = {
  create: "criou", update: "atualizou", delete: "removeu",
  login: "logou", export: "exportou", import: "importou",
};

const entityLabels: Record<string, string> = {
  sale: "venda", cost: "custo", user: "usuário", order: "pedido",
  agendamento: "agendamento", backup: "backup", payroll: "folha",
  termos: "termos", cancelamento: "cancelamento", client: "lead", pipeline: "negócio",
};

// ─── Primitivos ──────────────────────────────────────────────
function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-muted ${className}`} />;
}

function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-border bg-card ${className}`}>{children}</div>
  );
}

function SectionHead({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-4">
      <h3 className="text-sm font-medium text-foreground">{title}</h3>
      {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
    </div>
  );
}

function EmptyState({
  title = "Sem dados suficientes",
  hint,
  icon: Icon = BarChart3,
}: {
  title?: string;
  hint?: string;
  icon?: typeof BarChart3;
}) {
  return (
    <div className="flex min-h-40 flex-col items-center justify-center gap-2 px-4 py-6 text-center">
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon className="h-4 w-4" />
      </div>
      <p className="text-sm font-medium text-muted-foreground">{title}</p>
      {hint && <p className="max-w-xs text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

// ─── Metric ──────────────────────────────────────────────────
function MetricCard({
  title,
  value,
  icon: Icon,
  delta,
  subtitle,
}: {
  title: string;
  value: string;
  icon: typeof MessageSquare;
  delta?: { sign: number; label: string };
  subtitle?: string;
}) {
  return (
    <Panel className="p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-3.5 w-3.5" aria-hidden />
        <span className="text-[11px] font-medium uppercase tracking-wide">{title}</span>
      </div>
      <p className="mt-3 text-3xl font-semibold leading-none tabular-nums text-foreground">
        {value}
      </p>
      {delta ? (
        <DeltaRow sign={delta.sign} label={delta.label} />
      ) : subtitle ? (
        <p className="mt-2 text-xs text-muted-foreground">{subtitle}</p>
      ) : (
        <div className="mt-2 h-4" />
      )}
    </Panel>
  );
}

function DeltaRow({ sign, label }: { sign: number; label: string }) {
  const tone = sign > 0 ? "text-emerald-500" : sign < 0 ? "text-red-400" : "text-muted-foreground";
  const Arrow = sign > 0 ? ArrowUp : sign < 0 ? ArrowDown : Minus;
  return (
    <div className={`mt-2 flex items-center gap-1 text-xs ${tone}`}>
      <Arrow className="h-3.5 w-3.5" aria-hidden />
      <span className="tabular-nums">{label}</span>
    </div>
  );
}

function MetricSkeleton() {
  return (
    <Panel className="p-4">
      <Skeleton className="h-3 w-28" />
      <Skeleton className="mt-4 h-7 w-20" />
      <Skeleton className="mt-3 h-3 w-16" />
    </Panel>
  );
}

// ─── Conversations chart ─────────────────────────────────────
function ConversationsChart({
  series,
  loading,
}: {
  series: ConversationPoint[] | null;
  loading: boolean;
}) {
  if (loading) {
    return (
      <Panel className="h-full p-5">
        <Skeleton className="mb-2 h-4 w-40" />
        <Skeleton className="mb-4 h-3 w-56" />
        <Skeleton className="h-48 w-full" />
      </Panel>
    );
  }

  const hasData = series && series.some((p) => p.incoming > 0 || p.outgoing > 0);
  const maxVal = Math.max(...(series?.map((p) => p.incoming + p.outgoing) ?? [0]), 1);

  return (
    <Panel className="flex h-full flex-col overflow-hidden p-5">
      <SectionHead title="Conversas ao longo do tempo" subtitle="Volume diário de mensagens por direção" />

      {!hasData ? (
        <EmptyState
          icon={MessageSquare}
          title="Sem atividade de mensagens"
          hint="Envie ou receba mensagens para popular este gráfico."
        />
      ) : (
        <div className="mt-1 flex h-48 items-end gap-[3px]">
          {series!.slice(-30).map((point, idx) => {
            const totalH = ((point.incoming + point.outgoing) / maxVal) * 100;
            const inH = totalH > 0 ? (point.incoming / (point.incoming + point.outgoing)) * totalH : 0;
            const outH = totalH - inH;
            return (
              <div
                key={idx}
                className="group relative flex h-full flex-1 flex-col justify-end"
                title={`${point.date}: ${point.incoming} recebidas, ${point.outgoing} enviadas`}
              >
                <div className="rounded-t-sm bg-blue-500/70 transition-colors group-hover:bg-blue-400" style={{ height: `${outH}%`, minHeight: outH > 0 ? 2 : 0 }} />
                <div className="rounded-b-sm bg-primary/70 transition-colors group-hover:bg-primary" style={{ height: `${inH}%`, minHeight: inH > 0 ? 2 : 0 }} />
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-primary" /> Recebidas</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-blue-500" /> Enviadas</span>
      </div>
    </Panel>
  );
}

// ─── Pipeline por estágio ────────────────────────────────────
function PipelineByStage({
  data,
  loading,
}: {
  data: PipelineStage[] | null;
  loading: boolean;
}) {
  if (loading) {
    return (
      <Panel className="h-full p-5">
        <Skeleton className="mb-2 h-4 w-32" />
        <Skeleton className="mb-4 h-3 w-40" />
        <Skeleton className="h-48 w-full" />
      </Panel>
    );
  }

  const hasData = data && data.length > 0 && data.some((s) => s.count > 0);
  const totalValue = data?.reduce((a, s) => a + s.value, 0) || 0;
  const totalCount = data?.reduce((a, s) => a + s.count, 0) || 0;

  return (
    <Panel className="flex h-full flex-col overflow-hidden p-5">
      <SectionHead title="Pipeline por estágio" subtitle="Negócios abertos por etapa" />

      {!hasData ? (
        <EmptyState icon={Briefcase} title="Sem negócios no pipeline" hint="Crie negócios no Pipeline para visualizar aqui." />
      ) : (
        <>
          <div className="mb-4 flex h-2 overflow-hidden rounded-full bg-muted">
            {data!.map((s) => {
              const pct = totalCount > 0 ? (s.count / totalCount) * 100 : 0;
              if (pct === 0) return null;
              return (
                <div
                  key={s.stage}
                  style={{ width: `${pct}%`, backgroundColor: s.color, minWidth: 3 }}
                  title={`${s.label}: ${s.count} (${formatCurrency(s.value)})`}
                />
              );
            })}
          </div>

          <div className="space-y-2.5">
            {data!.map((s) => (
              <div key={s.stage} className="flex items-center justify-between gap-3 text-sm">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
                  <span className="truncate text-muted-foreground">{s.label}</span>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="text-xs tabular-nums text-muted-foreground">{s.count}</span>
                  <span className="w-20 text-right font-medium tabular-nums text-foreground">{formatCurrency(s.value)}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-auto flex items-center justify-between border-t border-border pt-3">
            <span className="text-sm text-muted-foreground">Total aberto</span>
            <span className="text-base font-semibold tabular-nums text-foreground">{formatCurrency(totalValue)}</span>
          </div>
        </>
      )}
    </Panel>
  );
}

// ─── Atividade recente ───────────────────────────────────────
function ActivityFeed({
  items,
  loading,
}: {
  items: ActivityItem[] | null;
  loading: boolean;
}) {
  if (loading) {
    return (
      <Panel className="p-5">
        <Skeleton className="mb-4 h-4 w-32" />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-start gap-3 py-3">
            <Skeleton className="h-8 w-8 rounded-full" />
            <div className="flex-1">
              <Skeleton className="mb-2 h-3 w-48" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
        ))}
      </Panel>
    );
  }

  return (
    <Panel className="overflow-hidden p-5">
      <SectionHead title="Atividade recente" />
      {!items || items.length === 0 ? (
        <EmptyState icon={Clock} title="Nenhuma atividade recente" hint="As ações do sistema aparecerão aqui." />
      ) : (
        <div className="divide-y divide-border">
          {items.slice(0, 8).map((item) => (
            <div key={item.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <User className="h-3.5 w-3.5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-foreground">
                  <span className="font-medium">{item.userName}</span>{" "}
                  <span className="text-muted-foreground">{actionLabels[item.action] || item.action}</span>{" "}
                  <span className="text-muted-foreground">{entityLabels[item.entityType] || item.entityType}</span>
                </p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">{item.description}</p>
              </div>
              <span className="shrink-0 text-[10px] text-muted-foreground">{timeAgo(item.createdAt)}</span>
            </div>
          ))}
        </div>
      )}
    </Panel>
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

  const { globalUnit } = useGlobalUnit();
  const [userFilter, setUserFilter] = useState("");

  useEffect(() => {
    try {
      const raw = localStorage.getItem("virtuosa_user");
      if (raw) {
        const user = JSON.parse(raw);
        if (user.name) {
          const firstName = user.name.split(" ")[0];
          setUserName(firstName);
        }
      }
    } catch {}
    setUserFilter(localStorage.getItem("virtuosa_user_filter") || "");
    const handleUserFilterChanged = () => {
      setUserFilter(localStorage.getItem("virtuosa_user_filter") || "");
    };
    window.addEventListener("userFilterChanged", handleUserFilterChanged);
    return () => window.removeEventListener("userFilterChanged", handleUserFilterChanged);
  }, []);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (userFilter) params.set("userId", userFilter);
      if (globalUnit) params.set("unit", globalUnit);
      const qs = params.toString();
      const res = await fetch(qs ? `/api/crm/dashboard?${qs}` : "/api/crm/dashboard");
      if (!res.ok) throw new Error("Failed to fetch");
      const json = await res.json();
      setData(json);
      setLastUpdated(new Date());
    } catch (err) {
      console.error("[CRM Dashboard]", err);
    } finally {
      setLoading(false);
    }
  }, [userFilter, globalUnit]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const metrics = data?.metrics;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Greeting Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">
            Olá, {userName}! 👋
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Aqui está o resumo da operação {globalUnit && globalUnit !== "all" ? `em ${globalUnit}` : "global"}.
          </p>
        </div>
        <button
          onClick={loadDashboard}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-full bg-secondary/40 px-4 py-1.5 text-xs font-semibold text-secondary-foreground transition-colors hover:bg-secondary disabled:opacity-60"
          title="Atualizar dados"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          {lastUpdated
            ? `Atualizado às ${lastUpdated.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`
            : "Atualizar"}
        </button>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {loading || !metrics ? (
          Array.from({ length: 4 }).map((_, i) => <MetricSkeleton key={i} />)
        ) : (
          <>
            <MetricCard
              title="Conversas ativas"
              value={metrics.activeConversations.current.toLocaleString()}
              icon={MessageSquare}
              subtitle={
                metrics.activeConversations.current - metrics.activeConversations.previous > 0
                  ? `+${metrics.activeConversations.current - metrics.activeConversations.previous} abertas hoje`
                  : "Nenhuma nova conversa hoje"
              }
            />
            <MetricCard
              title="Aguardando resposta"
              value={metrics.unreadConversations.toLocaleString()}
              icon={Bell}
              subtitle={
                metrics.unreadConversations === 1
                  ? "1 conversa possui mensagem não lida"
                  : `${metrics.unreadConversations} conversas com mensagens não lidas`
              }
            />
            <MetricCard
              title="Pipeline aberto"
              value={formatCurrencyShort(metrics.openDealsValue)}
              icon={DollarSign}
              subtitle={`${metrics.openDealsCount} negócio${metrics.openDealsCount === 1 ? "" : "s"} aberto${metrics.openDealsCount === 1 ? "" : "s"}`}
            />
            <MetricCard
              title="Negócios Ganhos"
              value={formatCurrencyShort(metrics.wonDealsValue)}
              icon={Trophy}
              subtitle={`${metrics.wonDealsCount} negócio${metrics.wonDealsCount === 1 ? " fechado" : "s fechados"} este mês`}
            />
          </>
        )}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <ConversationsChart series={data?.conversationSeries || null} loading={loading} />
        </div>
        <div className="lg:col-span-2">
          <PipelineByStage data={data?.pipeline || null} loading={loading} />
        </div>
      </div>

      {/* Activity */}
      <ActivityFeed items={data?.activity || null} loading={loading} />
    </div>
  );
}
