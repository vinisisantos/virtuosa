"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  MessageSquare,
  UserPlus,
  DollarSign,
  Send,
  ArrowUp,
  ArrowDown,
  Minus,
  Briefcase,
  Radio,
  Zap,
  BarChart3,
  User,
  Clock,
  Eye,
  X,
} from "lucide-react";
import { useGlobalUnit } from "@/contexts/UnitContext";

// ─── Types ───────────────────────────────────────────────────
interface MetricsBundle {
  activeConversations: { current: number; previous: number };
  newContactsToday: { current: number; previous: number };
  openDealsValue: number;
  openDealsCount: number;
  messagesSentToday: { current: number; previous: number };
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
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
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
    const diffMs = now.getTime() - d.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffH = Math.floor(diffMin / 60);

    // Less than 1 minute
    if (diffMin < 1) return "agora";
    // Minutes
    if (diffMin < 60) return `${diffMin}m atrás`;
    // Hours (same day)
    if (diffH < 24) return `${diffH}h atrás`;

    // Check calendar days
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dateStart = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const diffDays = Math.round((todayStart.getTime() - dateStart.getTime()) / 86400000);

    const timeStr = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

    if (diffDays === 1) return `ontem às ${timeStr}`;
    if (diffDays < 7) {
      const weekday = d.toLocaleDateString("pt-BR", { weekday: "short" });
      return `${weekday} ${timeStr}`;
    }

    // Older: show date
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch {
    return "";
  }
}

const actionLabels: Record<string, string> = {
  create: "criou",
  update: "atualizou",
  delete: "removeu",
  login: "logou",
  export: "exportou",
  import: "importou",
};

const entityLabels: Record<string, string> = {
  sale: "venda",
  cost: "custo",
  user: "usuário",
  order: "pedido",
  agendamento: "agendamento",
  backup: "backup",
  payroll: "folha",
  termos: "termos",
  cancelamento: "cancelamento",
};

// ─── Component: Skeleton ─────────────────────────────────────
function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded-md bg-muted ${className}`} />
  );
}

function SkeletonCard() {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="mt-4 h-8 w-20" />
      <Skeleton className="mt-2 h-3 w-16" />
    </div>
  );
}

// ─── Component: MetricCard ───────────────────────────────────
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
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-start justify-between">
        <p className="text-sm font-medium text-muted-foreground">{title}</p>
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="mt-3 text-[28px] leading-none font-bold tabular-nums text-foreground">
        {value}
      </p>
      {delta ? (
        <DeltaRow sign={delta.sign} label={delta.label} />
      ) : subtitle ? (
        <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>
      ) : null}
    </div>
  );
}

function DeltaRow({ sign, label }: { sign: number; label: string }) {
  const tone =
    sign > 0
      ? "text-emerald-400"
      : sign < 0
      ? "text-red-400"
      : "text-muted-foreground";
  const Arrow = sign > 0 ? ArrowUp : sign < 0 ? ArrowDown : Minus;
  return (
    <div className={`mt-2 flex items-center gap-1 text-sm ${tone}`}>
      <Arrow className="h-4 w-4" aria-hidden />
      <span className="tabular-nums">{label}</span>
    </div>
  );
}

// ─── Component: QuickActions ─────────────────────────────────
const QUICK_ACTIONS = [
  { label: "Novo Contato", href: "/clientes", icon: UserPlus, tint: "text-primary" },
  { label: "Novo Deal", href: "/crm/pipeline", icon: Briefcase, tint: "text-blue-400" },
  { label: "Campanhas", href: "/crm/campanhas", icon: Radio, tint: "text-amber-400" },
  { label: "Estatísticas", href: "/crm/estatistica", icon: Zap, tint: "text-primary" },
];

function QuickActions() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {QUICK_ACTIONS.map((a) => {
        const Icon = a.icon;
        return (
          <Link
            key={a.href}
            href={a.href}
            className="group flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 transition-colors hover:border-border hover:bg-muted/60"
          >
            <div
              className={`flex h-9 w-9 items-center justify-center rounded-lg bg-muted ${a.tint}`}
            >
              <Icon className="h-4 w-4" />
            </div>
            <span className="text-sm font-medium text-foreground">
              {a.label}
            </span>
          </Link>
        );
      })}
    </div>
  );
}

// ─── Component: EmptyState ───────────────────────────────────
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
    <div className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-card/40 px-4 py-6 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon className="h-5 w-5" />
      </div>
      <p className="text-sm font-medium text-muted-foreground">{title}</p>
      {hint && (
        <p className="max-w-xs text-xs text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}

// ─── Component: ConversationsChart (simplified bar chart) ────
function ConversationsChart({
  series,
  loading,
}: {
  series: ConversationPoint[] | null;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="h-full rounded-xl border border-border bg-card p-5">
        <Skeleton className="h-4 w-40 mb-2" />
        <Skeleton className="h-3 w-56 mb-4" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  const hasData = series && series.some((p) => p.incoming > 0 || p.outgoing > 0);

  return (
    <div className="flex flex-col rounded-xl border border-border bg-card p-5 overflow-hidden">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground">
            Conversas ao Longo do Tempo
          </h3>
          <p className="text-xs text-muted-foreground">
            Volume diário de mensagens por direção
          </p>
        </div>
      </div>

      {!hasData ? (
        <EmptyState
          icon={MessageSquare}
          title="Sem atividade de mensagens neste período"
          hint="Envie ou receba mensagens para popular este gráfico."
        />
      ) : (
        <div className="flex items-end gap-[2px] h-48 mt-2">
          {series!.slice(-30).map((point, idx) => {
            const maxVal = Math.max(
              ...series!.map((p) => p.incoming + p.outgoing),
              1
            );
            const totalH = ((point.incoming + point.outgoing) / maxVal) * 100;
            const inH =
              totalH > 0
                ? (point.incoming / (point.incoming + point.outgoing)) * totalH
                : 0;
            const outH = totalH - inH;

            return (
              <div
                key={idx}
                className="flex-1 flex flex-col justify-end h-full group relative"
                title={`${point.date}: ${point.incoming} recebidas, ${point.outgoing} enviadas`}
              >
                <div
                  className="bg-blue-500/80 rounded-t-sm transition-all group-hover:bg-blue-400"
                  style={{ height: `${outH}%`, minHeight: outH > 0 ? 2 : 0 }}
                />
                <div
                  className="bg-primary/80 rounded-b-sm transition-all group-hover:bg-primary"
                  style={{ height: `${inH}%`, minHeight: inH > 0 ? 2 : 0 }}
                />
              </div>
            );
          })}
        </div>
      )}

      <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-primary" /> Recebidas
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-blue-500" /> Enviadas
        </span>
      </div>
    </div>
  );
}

// ─── Component: PipelineDonut (simplified) ───────────────────
function PipelineDonut({
  data,
  loading,
}: {
  data: PipelineStage[] | null;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="h-full rounded-xl border border-border bg-card p-5">
        <Skeleton className="h-4 w-32 mb-2" />
        <Skeleton className="h-3 w-40 mb-4" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  const hasData = data && data.length > 0 && data.some((s) => s.count > 0);
  const totalValue = data?.reduce((acc, s) => acc + s.value, 0) || 0;
  const totalCount = data?.reduce((acc, s) => acc + s.count, 0) || 0;

  return (
    <div className="flex flex-col rounded-xl border border-border bg-card p-5 overflow-hidden">
      <h3 className="text-sm font-semibold text-foreground">
        Pipeline por Estágio
      </h3>
      <p className="text-xs text-muted-foreground mb-4">
        Deals abertos por estágio
      </p>

      {!hasData ? (
        <EmptyState
          icon={Briefcase}
          title="Sem deals no pipeline"
          hint="Crie deals no Pipeline para visualizar aqui."
        />
      ) : (
        <>
          {/* Horizontal stacked bar */}
          <div className="flex h-6 rounded-full overflow-hidden mb-4">
            {data!.map((stage) => {
              const pct = totalCount > 0 ? (stage.count / totalCount) * 100 : 0;
              if (pct === 0) return null;
              return (
                <div
                  key={stage.stage}
                  className="transition-all"
                  style={{
                    width: `${pct}%`,
                    backgroundColor: stage.color,
                    minWidth: pct > 0 ? 4 : 0,
                  }}
                  title={`${stage.label}: ${stage.count} deals (${formatCurrency(stage.value)})`}
                />
              );
            })}
          </div>

          {/* Legend */}
          <div className="space-y-2">
            {data!.map((stage) => (
              <div
                key={stage.stage}
                className="flex items-center justify-between text-sm"
              >
                <div className="flex items-center gap-2">
                  <span
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: stage.color }}
                  />
                  <span className="text-muted-foreground">{stage.label}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground">
                    {stage.count} deal{stage.count !== 1 ? "s" : ""}
                  </span>
                  <span className="font-medium text-foreground tabular-nums">
                    {formatCurrency(stage.value)}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 pt-3 border-t border-border flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Total</span>
            <span className="text-lg font-bold text-foreground tabular-nums">
              {formatCurrency(totalValue)}
            </span>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Component: ActivityFeed ─────────────────────────────────
function ActivityFeed({
  items,
  loading,
}: {
  items: ActivityItem[] | null;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-card p-5">
        <Skeleton className="h-4 w-32 mb-4" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-start gap-3 py-3">
            <Skeleton className="h-8 w-8 rounded-full" />
            <div className="flex-1">
              <Skeleton className="h-3 w-48 mb-2" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5 overflow-hidden">
      <div className="flex items-center gap-3 mb-4">
        <h3 className="text-sm font-semibold text-foreground">Atividade Recente</h3>
      </div>

      {!items || items.length === 0 ? (
        <EmptyState
          icon={Clock}
          title="Nenhuma atividade recente"
          hint="As ações do sistema aparecerão aqui."
        />
      ) : (
        <div className="divide-y divide-border">
          {items.slice(0, 10).map((item) => (
            <div
              key={item.id}
              className="flex items-start gap-3 py-3 first:pt-0 last:pb-0"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <User className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-foreground">
                  <span className="font-medium">{item.userName}</span>{" "}
                  <span className="text-muted-foreground">
                    {actionLabels[item.action] || item.action}
                  </span>{" "}
                  <span className="text-muted-foreground">
                    {entityLabels[item.entityType] || item.entityType}
                  </span>
                </p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {item.description}
                </p>
              </div>
              <span className="shrink-0 text-[10px] text-muted-foreground">
                {timeAgo(item.createdAt)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════
// ─── Main Dashboard Page ─────────────────────────────────────
// ═════════════════════════════════════════════════════════════
export default function CRMDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const { globalUnit } = useGlobalUnit();
  const [userFilter, setUserFilter] = useState("");

  useEffect(() => {
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
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Análises em tempo real de conversas, contatos, deals e campanhas.
        </p>
      </div>



      {/* Metric cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {loading || !metrics ? (
          Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
        ) : (
          <>
            <MetricCard
              title="Conversas Ativas"
              value={metrics.activeConversations.current.toLocaleString()}
              icon={MessageSquare}
              delta={{
                sign: metrics.activeConversations.previous,
                label: deltaLabel(
                  metrics.activeConversations.previous,
                  "novas hoje vs ontem"
                ),
              }}
            />
            <MetricCard
              title="Novos Contatos Hoje"
              value={metrics.newContactsToday.current.toLocaleString()}
              icon={UserPlus}
              delta={{
                sign:
                  metrics.newContactsToday.current -
                  metrics.newContactsToday.previous,
                label: deltaLabel(
                  metrics.newContactsToday.current -
                    metrics.newContactsToday.previous,
                  "vs ontem"
                ),
              }}
            />
            <MetricCard
              title="Valor Pipeline Aberto"
              value={formatCurrency(metrics.openDealsValue)}
              icon={DollarSign}
              subtitle={`${metrics.openDealsCount} deal${
                metrics.openDealsCount === 1 ? "" : "s"
              } aberto${metrics.openDealsCount === 1 ? "" : "s"}`}
            />
            <MetricCard
              title="Mensagens Hoje"
              value={metrics.messagesSentToday.current.toLocaleString()}
              icon={Send}
              delta={{
                sign:
                  metrics.messagesSentToday.current -
                  metrics.messagesSentToday.previous,
                label: deltaLabel(
                  metrics.messagesSentToday.current -
                    metrics.messagesSentToday.previous,
                  "vs ontem"
                ),
              }}
            />
          </>
        )}
      </div>

      {/* Quick actions */}
      <QuickActions />

      {/* Charts row */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <ConversationsChart
            series={data?.conversationSeries || null}
            loading={loading}
          />
        </div>
        <div className="lg:col-span-2">
          <PipelineDonut data={data?.pipeline || null} loading={loading} />
        </div>
      </div>

      {/* Activity feed */}
      <ActivityFeed items={data?.activity || null} loading={loading} />
    </div>
  );
}
