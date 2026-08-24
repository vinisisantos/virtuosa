"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  ArrowUpRight,
  CalendarClock,
  CheckCircle2,
  Clock3,
  History,
  ListChecks,
  Loader2,
  MessageSquareText,
  RefreshCw,
  RotateCcw,
  UserRound,
} from "lucide-react";

import {
  FOLLOW_UP_CENTER_PAGE_SIZE,
  FOLLOW_UP_CENTER_PILOT_UNIT,
  followUpCenterAgeBucket,
  type FollowUpCenterBucket,
} from "@/lib/whatsapp/follow-up-center";

type FollowUpCenterStats = {
  totalDue: number;
  firstAttempt: number;
  dueToday: number;
  dueOneToSevenDays: number;
  dueSevenToFourteenDays: number;
  dueOverFourteenDays: number;
  manualFollowUpsDue: number;
};

type FollowUpConversation = {
  id: string;
  instanceId: string;
  assignedTo: string | null;
  assignedToName: string | null;
  lastMessage: string | null;
  lastMessageAt: string | null;
  lastInboundAt: string | null;
  lastOutboundAt: string | null;
  callbackDueAt: string;
  callbackStreakCount: number;
  callbackTotalCount: number;
  canReply: boolean;
  contact: {
    name: string | null;
    phone: string;
    profilePic: string | null;
    unit: string | null;
  };
  instance: {
    name: string;
    unit: string | null;
  };
};

type FollowUpCenterResponse = {
  unit: string;
  bucket: FollowUpCenterBucket;
  scope: {
    instanceCount: number;
    label: string;
  };
  stats: FollowUpCenterStats;
  conversations: FollowUpConversation[];
  hasMore: boolean;
  nextOffset: number | null;
  serverTime: string;
};

const EMPTY_STATS: FollowUpCenterStats = {
  totalDue: 0,
  firstAttempt: 0,
  dueToday: 0,
  dueOneToSevenDays: 0,
  dueSevenToFourteenDays: 0,
  dueOverFourteenDays: 0,
  manualFollowUpsDue: 0,
};

const BUCKET_PRESENTATION: Record<
  FollowUpCenterBucket,
  { label: string; description: string }
> = {
  priority: {
    label: "Prioridade",
    description: "Vencidos há menos de 7 dias",
  },
  recovery: {
    label: "Recuperação",
    description: "Vencidos de 7 a 14 dias",
  },
  reactivation: {
    label: "Reativação",
    description: "Vencidos há 14 dias ou mais",
  },
  first_attempt: {
    label: "Primeira rechamada",
    description: "Ainda sem ação neste ciclo",
  },
  all: {
    label: "Todos",
    description: "Todo o estoque vencido",
  },
};

function formatPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  const local = digits.startsWith("55") ? digits.slice(2) : digits;
  if (local.length === 11) {
    return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
  }
  if (local.length === 10) {
    return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
  }
  return value;
}

function formatDateTime(value?: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function overdueLabel(value: string, now: number) {
  const elapsedMs = Math.max(0, now - new Date(value).getTime());
  const hours = Math.floor(elapsedMs / (60 * 60 * 1000));
  if (hours < 1) return "há menos de 1h";
  if (hours < 24) return `há ${hours}h`;
  const days = Math.floor(hours / 24);
  return `há ${days} ${days === 1 ? "dia" : "dias"}`;
}

function initials(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function agePresentation(callbackDueAt: string, now: number) {
  const bucket = followUpCenterAgeBucket(callbackDueAt, now);
  if (bucket === "today") {
    return {
      label: "Prioridade de hoje",
      className: "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    };
  }
  if (bucket === "active") {
    return {
      label: "Acompanhamento ativo",
      className: "border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-300",
    };
  }
  if (bucket === "recovery") {
    return {
      label: "Recuperação",
      className: "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    };
  }
  return {
    label: "Reativação",
    className: "border-rose-500/25 bg-rose-500/10 text-rose-700 dark:text-rose-300",
  };
}

function buildScopedUrl(pathname: string, searchParams: URLSearchParams) {
  const params = new URLSearchParams();
  const targetInstanceId = searchParams.get("targetInstanceId");
  const targetUserId = searchParams.get("targetUserId");
  const scopeLabel = searchParams.get("scopeLabel");
  if (targetInstanceId) params.set("targetInstanceId", targetInstanceId);
  else if (targetUserId) params.set("targetUserId", targetUserId);
  if (scopeLabel) params.set("scopeLabel", scopeLabel);
  params.set("unit", FOLLOW_UP_CENTER_PILOT_UNIT);
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export default function FollowUpCenterPage() {
  const searchParams = useSearchParams();
  const scopeParams = searchParams.toString();
  const [bucket, setBucket] = useState<FollowUpCenterBucket>("priority");
  const [data, setData] = useState<FollowUpCenterResponse | null>(null);
  const [conversations, setConversations] = useState<FollowUpConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clockNow, setClockNow] = useState(Date.now());

  const scopedSearchParams = useMemo(() => new URLSearchParams(scopeParams), [scopeParams]);
  const selectedScopeLabel = scopedSearchParams.get("scopeLabel") || data?.scope.label || "Carregando...";
  const inboxHref = useMemo(() => {
    const href = buildScopedUrl("/crm/inbox", scopedSearchParams);
    const url = new URL(href, "http://local");
    url.searchParams.set("queue", "callback");
    return `${url.pathname}?${url.searchParams.toString()}`;
  }, [scopedSearchParams]);
  const manualFollowUpHref = useMemo(() => {
    const href = buildScopedUrl("/crm/inbox", scopedSearchParams);
    const url = new URL(href, "http://local");
    url.searchParams.set("queue", "followup");
    return `${url.pathname}?${url.searchParams.toString()}`;
  }, [scopedSearchParams]);

  const fetchPage = useCallback(async (params?: { append?: boolean; offset?: number }) => {
    const append = Boolean(params?.append);
    if (append) setLoadingMore(true);
    else setLoading(true);
    if (!append) setError(null);

    try {
      const query = new URLSearchParams(scopedSearchParams);
      query.delete("unit");
      query.set("bucket", bucket);
      query.set("limit", String(FOLLOW_UP_CENTER_PAGE_SIZE));
      query.set("offset", String(params?.offset || 0));
      const response = await fetch(`/api/whatsapp/follow-up-center?${query.toString()}`, {
        cache: "no-store",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || "Não foi possível carregar a Central de Follow-up.");
      }
      const nextData = payload as FollowUpCenterResponse;
      setData(nextData);
      setConversations((current) => append
        ? [...current, ...nextData.conversations]
        : nextData.conversations);
      setClockNow(new Date(nextData.serverTime).getTime());
    } catch (fetchError) {
      setError(fetchError instanceof Error
        ? fetchError.message
        : "Não foi possível carregar a Central de Follow-up.");
      if (!append) {
        setData(null);
        setConversations([]);
      }
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [bucket, scopedSearchParams]);

  useEffect(() => {
    void fetchPage();
  }, [fetchPage]);

  useEffect(() => {
    const interval = window.setInterval(() => setClockNow(Date.now()), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  const stats = data?.stats || EMPTY_STATS;
  const bucketCounts: Record<FollowUpCenterBucket, number> = {
    priority: stats.dueToday + stats.dueOneToSevenDays,
    recovery: stats.dueSevenToFourteenDays,
    reactivation: stats.dueOverFourteenDays,
    first_attempt: stats.firstAttempt,
    all: stats.totalDue,
  };
  const selectedBucket = BUCKET_PRESENTATION[bucket];

  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-4 pb-8 sm:gap-6">
      <section className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm">
        <div className="relative overflow-hidden px-4 py-5 sm:px-6 sm:py-7">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.14),transparent_42%),radial-gradient(circle_at_bottom_left,rgba(59,130,246,0.10),transparent_45%)]" />
          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <Link
                href={inboxHref}
                className="mb-4 inline-flex min-h-11 items-center gap-2 rounded-full border border-border/80 bg-background/70 px-3 text-sm font-semibold text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground sm:min-h-9"
              >
                <ArrowLeft className="h-4 w-4" />
                Voltar ao Inbox
              </Link>
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500/12 text-emerald-700 ring-1 ring-emerald-500/15 dark:text-emerald-300 sm:h-12 sm:w-12">
                  <ListChecks className="h-5 w-5 sm:h-6 sm:w-6" />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-xl font-black tracking-tight text-foreground sm:text-2xl">
                      Central de Follow-up
                    </h1>
                    <span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                      Piloto · {FOLLOW_UP_CENTER_PILOT_UNIT}
                    </span>
                  </div>
                  <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                    Trabalhe primeiro os contatos mais recentes e acompanhe separadamente recuperação e reativação.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
              <div className="min-w-0 rounded-xl border border-border/70 bg-background/65 px-3 py-2.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Escopo do Inbox</p>
                <p className="mt-0.5 truncate text-sm font-bold text-foreground">{selectedScopeLabel}</p>
              </div>
              <button
                type="button"
                onClick={() => void fetchPage()}
                disabled={loading || loadingMore}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 text-sm font-bold text-foreground transition-colors hover:bg-muted disabled:cursor-wait disabled:opacity-60"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                Atualizar
              </button>
            </div>
          </div>
        </div>
      </section>

      {error ? (
        <section className="rounded-2xl border border-red-500/25 bg-red-500/8 p-5 text-red-700 dark:text-red-300">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <h2 className="font-bold">Não foi possível carregar o piloto</h2>
              <p className="mt-1 text-sm opacity-90">{error}</p>
              <button
                type="button"
                onClick={() => void fetchPage()}
                className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl border border-current/25 px-4 text-sm font-bold hover:bg-red-500/10"
              >
                <RotateCcw className="h-4 w-4" />
                Tentar novamente
              </button>
            </div>
          </div>
        </section>
      ) : (
        <>
          <section aria-label="Panorama da fila" className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
            {[
              {
                label: "Vencidos",
                value: stats.totalDue,
                detail: "estoque total",
                icon: Clock3,
                className: "text-foreground",
              },
              {
                label: "Hoje",
                value: stats.dueToday,
                detail: "menos de 24h",
                icon: CheckCircle2,
                className: "text-emerald-600 dark:text-emerald-400",
              },
              {
                label: "1 a 7 dias",
                value: stats.dueOneToSevenDays,
                detail: "acompanhamento",
                icon: CalendarClock,
                className: "text-sky-600 dark:text-sky-400",
              },
              {
                label: "7 a 14 dias",
                value: stats.dueSevenToFourteenDays,
                detail: "recuperação",
                icon: History,
                className: "text-amber-600 dark:text-amber-400",
              },
              {
                label: "Mais de 14 dias",
                value: stats.dueOverFourteenDays,
                detail: "reativação",
                icon: RotateCcw,
                className: "text-rose-600 dark:text-rose-400",
              },
              {
                label: "Primeira ação",
                value: stats.firstAttempt,
                detail: "nenhuma rechamada",
                icon: MessageSquareText,
                className: "text-violet-600 dark:text-violet-400",
              },
            ].map((metric) => (
              <article key={metric.label} className="min-w-0 rounded-2xl border border-border/70 bg-card p-3.5 shadow-sm sm:p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="min-h-7 text-[10px] font-black uppercase leading-tight tracking-wider text-muted-foreground sm:text-[11px]">{metric.label}</p>
                    <p className={`mt-1 text-2xl font-black tabular-nums sm:text-3xl ${metric.className}`}>
                      {metric.value.toLocaleString("pt-BR")}
                    </p>
                  </div>
                  <metric.icon className={`h-4 w-4 shrink-0 ${metric.className}`} />
                </div>
                <p className="mt-1 truncate text-[11px] text-muted-foreground">{metric.detail}</p>
              </article>
            ))}
          </section>

          {stats.manualFollowUpsDue > 0 && (
            <section className="flex flex-col gap-3 rounded-2xl border border-violet-500/20 bg-violet-500/8 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-violet-600 dark:text-violet-300" />
                <div>
                  <h2 className="text-sm font-black text-foreground">
                    {stats.manualFollowUpsDue} {stats.manualFollowUpsDue === 1 ? "retorno manual vencido no escopo" : "retornos manuais vencidos no escopo"}
                  </h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">A fila Retornos do Inbox mostra os que estão atribuídos a você.</p>
                </div>
              </div>
              <Link
                href={manualFollowUpHref}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 text-sm font-bold text-white transition-colors hover:bg-violet-700"
              >
                Abrir meus Retornos
                <ArrowUpRight className="h-4 w-4" />
              </Link>
            </section>
          )}

          <section className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm">
            <div className="border-b border-border/70 p-4 sm:p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <h2 className="text-lg font-black text-foreground">Fila de trabalho</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {selectedBucket.description}. As primeiras rechamadas aparecem antes das demais.
                  </p>
                </div>
                <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none lg:flex-wrap lg:justify-end lg:overflow-visible" role="group" aria-label="Filtrar fila por idade">
                  {(Object.keys(BUCKET_PRESENTATION) as FollowUpCenterBucket[]).map((key) => {
                    const active = bucket === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setBucket(key)}
                        aria-pressed={active}
                        className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-3 text-xs font-black transition-colors sm:min-h-9 ${
                          active
                            ? "border-primary/25 bg-primary/12 text-primary"
                            : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
                        }`}
                      >
                        {BUCKET_PRESENTATION[key].label}
                        <span className={`rounded-full px-1.5 py-0.5 text-[10px] tabular-nums ${active ? "bg-primary/15" : "bg-muted"}`}>
                          {bucketCounts[key].toLocaleString("pt-BR")}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {loading ? (
              <div className="flex min-h-72 flex-col items-center justify-center gap-3 p-8 text-center">
                <Loader2 className="h-7 w-7 animate-spin text-primary" />
                <p className="text-sm font-semibold text-muted-foreground">Organizando a fila de Osasco...</p>
              </div>
            ) : conversations.length === 0 ? (
              <div className="flex min-h-72 flex-col items-center justify-center p-8 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-300">
                  <CheckCircle2 className="h-6 w-6" />
                </div>
                <h3 className="mt-4 font-black text-foreground">Nenhum contato nesta faixa</h3>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">Escolha outro filtro para consultar o restante do estoque.</p>
              </div>
            ) : (
              <div className="divide-y divide-border/70">
                {conversations.map((conversation) => {
                  const contactLabel = conversation.contact.name || formatPhone(conversation.contact.phone);
                  const age = agePresentation(conversation.callbackDueAt, clockNow);
                  const inboxParams = new URLSearchParams(scopedSearchParams);
                  inboxParams.set("unit", FOLLOW_UP_CENTER_PILOT_UNIT);
                  inboxParams.set("targetInstanceId", conversation.instanceId);
                  inboxParams.delete("targetUserId");
                  inboxParams.set("conversationId", conversation.id);
                  inboxParams.set("queue", "callback");
                  const conversationHref = `/crm/inbox?${inboxParams.toString()}`;

                  return (
                    <article key={conversation.id} className="p-4 transition-colors hover:bg-muted/20 sm:p-5">
                      <div className="flex flex-col gap-4 xl:grid xl:grid-cols-[minmax(260px,1.1fr)_minmax(220px,1fr)_minmax(300px,1.2fr)_auto] xl:items-center">
                        <div className="flex min-w-0 items-start gap-3">
                          {conversation.contact.profilePic ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={conversation.contact.profilePic}
                              alt=""
                              className="h-11 w-11 shrink-0 rounded-full object-cover ring-1 ring-border sm:h-12 sm:w-12"
                            />
                          ) : (
                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-black text-primary ring-1 ring-primary/10 sm:h-12 sm:w-12">
                              {initials(contactLabel) || "?"}
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="max-w-full truncate text-sm font-black text-foreground sm:text-base">{contactLabel}</h3>
                              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-black ${age.className}`}>
                                {age.label}
                              </span>
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">{formatPhone(conversation.contact.phone)}</p>
                            <p className="mt-1 truncate text-xs text-muted-foreground" title={conversation.lastMessage || undefined}>
                              {conversation.lastMessage || "Sem prévia da última mensagem"}
                            </p>
                          </div>
                        </div>

                        <dl className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3 xl:grid-cols-2">
                          <div className="rounded-xl border border-border/60 bg-background/60 px-3 py-2">
                            <dt className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Vencida</dt>
                            <dd className="mt-0.5 font-black text-foreground">{overdueLabel(conversation.callbackDueAt, clockNow)}</dd>
                          </div>
                          <div className="rounded-xl border border-border/60 bg-background/60 px-3 py-2">
                            <dt className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Tentativa</dt>
                            <dd className="mt-0.5 font-black text-foreground">{conversation.callbackStreakCount + 1} de 6</dd>
                          </div>
                          <div className="col-span-2 rounded-xl border border-border/60 bg-background/60 px-3 py-2 sm:col-span-1 xl:col-span-2">
                            <dt className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Responsável</dt>
                            <dd className="mt-0.5 flex min-w-0 items-center gap-1.5 font-black text-foreground">
                              <UserRound className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                              <span className="truncate">{conversation.assignedToName || "Sem responsável"}</span>
                            </dd>
                          </div>
                        </dl>

                        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                          <div>
                            <dt className="text-muted-foreground">Última entrada</dt>
                            <dd className="mt-0.5 font-bold text-foreground">{formatDateTime(conversation.lastInboundAt)}</dd>
                          </div>
                          <div>
                            <dt className="text-muted-foreground">Última saída</dt>
                            <dd className="mt-0.5 font-bold text-foreground">{formatDateTime(conversation.lastOutboundAt)}</dd>
                          </div>
                          <div className="col-span-2">
                            <dt className="text-muted-foreground">Conta</dt>
                            <dd className="mt-0.5 truncate font-bold text-foreground" title={conversation.instance.name}>
                              {scopedSearchParams.get("targetInstanceId") === conversation.instanceId
                                ? selectedScopeLabel
                                : conversation.instance.name}
                            </dd>
                          </div>
                        </dl>

                        <Link
                          href={conversationHref}
                          className={`inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-black transition-colors xl:w-auto ${
                            conversation.canReply
                              ? "bg-emerald-600 text-white hover:bg-emerald-700"
                              : "border border-border bg-background text-foreground hover:bg-muted"
                          }`}
                        >
                          {conversation.canReply ? "Abrir e rechamar" : "Consultar conversa"}
                          <ArrowUpRight className="h-4 w-4" />
                        </Link>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}

            {!loading && conversations.length > 0 && (
              <div className="flex flex-col items-center justify-between gap-3 border-t border-border/70 p-4 sm:flex-row sm:px-5">
                <p className="text-xs text-muted-foreground">
                  {conversations.length.toLocaleString("pt-BR")} contatos exibidos em {selectedBucket.label.toLowerCase()}.
                </p>
                {data?.hasMore && data.nextOffset !== null && (
                  <button
                    type="button"
                    onClick={() => void fetchPage({ append: true, offset: data.nextOffset || 0 })}
                    disabled={loadingMore}
                    className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 text-sm font-black text-foreground transition-colors hover:bg-muted disabled:cursor-wait disabled:opacity-60 sm:w-auto"
                  >
                    {loadingMore ? <Loader2 className="h-4 w-4 animate-spin" /> : <ListChecks className="h-4 w-4" />}
                    Carregar mais 50
                  </button>
                )}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
