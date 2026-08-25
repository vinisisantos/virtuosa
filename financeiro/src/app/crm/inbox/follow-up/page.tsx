"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  ArrowUpRight,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock3,
  History,
  ListChecks,
  Loader2,
  Megaphone,
  MessageSquareText,
  RefreshCw,
  RotateCcw,
  Send,
  UsersRound,
  UserRound,
  X,
} from "lucide-react";

import { toast } from "@/components/toast";
import { SavedRepliesDialog } from "@/components/whatsapp/saved-replies-dialog";
import { useWhatsAppSavedReplies } from "@/hooks/use-whatsapp-saved-replies";
import {
  FOLLOW_UP_CENTER_PAGE_SIZE,
  FOLLOW_UP_CENTER_PILOT_UNIT,
  followUpCenterAgeBucket,
  type FollowUpCenterBucket,
} from "@/lib/whatsapp/follow-up-center";
import { getEvaluationScheduleUnitConfigByUnit } from "@/lib/whatsapp/evaluation-schedule-confirmation-message";
import { renderWhatsAppMessageTemplate } from "@/lib/whatsapp/message-template";

const MAX_BULK_FOLLOW_UP_CONVERSATIONS = 10;
const ALL_CAMPAIGNS_KEY = "campaign:all";
const NO_CAMPAIGN_KEY = "campaign:none";
const BULK_FOLLOW_UP_INTERVAL_MS = 1_000;

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
  campaignName: string | null;
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

type CampaignGroup = {
  key: string;
  campaignName: string | null;
  conversations: FollowUpConversation[];
};

type CampaignFilterOption = {
  key: string;
  label: string;
  count: number;
};

type BulkFollowUpProgress = {
  total: number;
  completed: number;
  sent: number;
  failed: number;
  skipped: number;
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

function campaignGroupKey(campaignName?: string | null) {
  const normalized = campaignName?.trim();
  return normalized ? `campaign:${normalized}` : NO_CAMPAIGN_KEY;
}

function waitForBulkFollowUpInterval() {
  return new Promise((resolve) => window.setTimeout(resolve, BULK_FOLLOW_UP_INTERVAL_MS));
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
  const [campaignFilterKey, setCampaignFilterKey] = useState(ALL_CAMPAIGNS_KEY);
  const [selectedConversationIds, setSelectedConversationIds] = useState<string[]>([]);
  const [campaignDrafts, setCampaignDrafts] = useState<Record<string, string>>({});
  const [bulkComposerOpen, setBulkComposerOpen] = useState(false);
  const [bulkFollowUpSending, setBulkFollowUpSending] = useState(false);
  const [bulkFollowUpProgress, setBulkFollowUpProgress] = useState<BulkFollowUpProgress | null>(null);
  const [savedReplyCampaignKey, setSavedReplyCampaignKey] = useState<string | null>(null);
  const savedRepliesLibrary = useWhatsAppSavedReplies();

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

  useEffect(() => {
    setCampaignFilterKey(ALL_CAMPAIGNS_KEY);
    setSelectedConversationIds([]);
    setCampaignDrafts({});
    setBulkComposerOpen(false);
    setBulkFollowUpProgress(null);
  }, [bucket]);

  const selectedConversationIdSet = useMemo(
    () => new Set(selectedConversationIds),
    [selectedConversationIds],
  );
  const selectedConversations = useMemo(() => {
    const conversationById = new Map(conversations.map((conversation) => [conversation.id, conversation]));
    return selectedConversationIds
      .map((conversationId) => conversationById.get(conversationId))
      .filter((conversation): conversation is FollowUpConversation => Boolean(conversation));
  }, [conversations, selectedConversationIds]);
  const campaignGroups = useMemo(() => {
    const groups = new Map<string, CampaignGroup>();
    for (const conversation of selectedConversations) {
      const key = campaignGroupKey(conversation.campaignName);
      const existing = groups.get(key);
      if (existing) {
        existing.conversations.push(conversation);
      } else {
        groups.set(key, {
          key,
          campaignName: conversation.campaignName,
          conversations: [conversation],
        });
      }
    }
    return [...groups.values()];
  }, [selectedConversations]);
  const savedReplyCampaign = campaignGroups.find((group) => group.key === savedReplyCampaignKey) || null;
  const allCampaignDraftsReady = campaignGroups.length > 0
    && campaignGroups.every((group) => campaignDrafts[group.key]?.trim());
  const campaignFilterOptions = useMemo(() => {
    const options = new Map<string, CampaignFilterOption>();
    for (const conversation of conversations) {
      const key = campaignGroupKey(conversation.campaignName);
      const existing = options.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        options.set(key, {
          key,
          label: conversation.campaignName?.trim() || "Sem campanha",
          count: 1,
        });
      }
    }
    return [...options.values()].sort((left, right) => {
      if (left.key === NO_CAMPAIGN_KEY) return 1;
      if (right.key === NO_CAMPAIGN_KEY) return -1;
      return left.label.localeCompare(right.label, "pt-BR");
    });
  }, [conversations]);
  const filteredConversations = useMemo(() => (
    campaignFilterKey === ALL_CAMPAIGNS_KEY
      ? conversations
      : conversations.filter((conversation) => campaignGroupKey(conversation.campaignName) === campaignFilterKey)
  ), [campaignFilterKey, conversations]);
  const activeCampaignFilter = campaignFilterOptions.find((option) => option.key === campaignFilterKey) || null;

  const changeCampaignFilter = (nextFilterKey: string) => {
    if (bulkFollowUpSending || nextFilterKey === campaignFilterKey) return;
    setCampaignFilterKey(nextFilterKey);
    setSelectedConversationIds([]);
    setCampaignDrafts({});
    setBulkComposerOpen(false);
    setBulkFollowUpProgress(null);
  };

  const toggleConversationSelection = (conversation: FollowUpConversation) => {
    if (bulkFollowUpSending) return;
    if (!conversation.canReply) {
      toast("Esta conversa está disponível somente para consulta.", "error");
      return;
    }
    setSelectedConversationIds((current) => {
      if (current.includes(conversation.id)) {
        return current.filter((conversationId) => conversationId !== conversation.id);
      }
      if (current.length >= MAX_BULK_FOLLOW_UP_CONVERSATIONS) {
        toast(`Selecione no máximo ${MAX_BULK_FOLLOW_UP_CONVERSATIONS} contatos.`, "error");
        return current;
      }
      return [...current, conversation.id];
    });
  };

  const selectFirstAvailableConversations = () => {
    if (bulkFollowUpSending) return;
    const nextIds = filteredConversations
      .filter((conversation) => conversation.canReply)
      .slice(0, MAX_BULK_FOLLOW_UP_CONVERSATIONS)
      .map((conversation) => conversation.id);
    setSelectedConversationIds(nextIds);
    if (nextIds.length === 0) toast("Nenhum contato disponível para envio nesta página.", "error");
  };

  const updateCampaignDraft = (campaignKey: string, value: string) => {
    setCampaignDrafts((current) => ({ ...current, [campaignKey]: value }));
  };

  const campaignPreview = (group: CampaignGroup) => {
    const conversation = group.conversations[0];
    const unitConfig = getEvaluationScheduleUnitConfigByUnit(
      conversation.contact.unit || FOLLOW_UP_CENTER_PILOT_UNIT,
    );
    return renderWhatsAppMessageTemplate(campaignDrafts[group.key] || "", {
      contactName: conversation.contact.name,
      contactPhone: conversation.contact.phone,
      unit: unitConfig?.displayUnitName || conversation.contact.unit || FOLLOW_UP_CENTER_PILOT_UNIT,
      unitAddress: unitConfig?.address,
      unitLocationUrl: unitConfig?.locationUrl,
      attendantName: conversation.assignedToName,
    });
  };

  const sendBulkFollowUp = async () => {
    if (bulkFollowUpSending || !allCampaignDraftsReady) return;

    const recipients = campaignGroups.flatMap((group) => group.conversations.map((conversation) => ({
      conversation,
      message: campaignDrafts[group.key].trim(),
    })));
    if (recipients.length === 0 || recipients.length > MAX_BULK_FOLLOW_UP_CONVERSATIONS) return;

    setBulkFollowUpSending(true);
    setBulkFollowUpProgress({
      total: recipients.length,
      completed: 0,
      sent: 0,
      failed: 0,
      skipped: 0,
    });
    const query = new URLSearchParams(scopedSearchParams);
    query.set("unit", FOLLOW_UP_CENTER_PILOT_UNIT);
    const sendUrl = `/api/whatsapp/send?${query.toString()}`;
    const failedIds: string[] = [];
    let sent = 0;
    let failed = 0;
    let skipped = 0;

    try {
      for (let index = 0; index < recipients.length; index += 1) {
        const { conversation, message } = recipients[index];
        try {
          const response = await fetch(sendUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              conversationId: conversation.id,
              contactId: conversation.contact.phone,
              instanceId: conversation.instanceId,
              body: message,
              type: "text",
              claimConversation: true,
              requireCallbackDue: true,
            }),
          });
          const payload = await response.json().catch(() => ({}));
          if (!response.ok) {
            if (response.status === 409 && payload.code === "CALLBACK_NOT_DUE") {
              skipped += 1;
            } else {
              failed += 1;
              failedIds.push(conversation.id);
            }
          } else {
            sent += 1;
            setConversations((current) => current.filter((item) => item.id !== conversation.id));
          }
        } catch {
          failed += 1;
          failedIds.push(conversation.id);
        }

        setBulkFollowUpProgress({
          total: recipients.length,
          completed: index + 1,
          sent,
          failed,
          skipped,
        });
        if (index < recipients.length - 1) await waitForBulkFollowUpInterval();
      }

      setSelectedConversationIds(failedIds);
      await fetchPage();
      if (failedIds.length === 0) {
        setBulkComposerOpen(false);
        setCampaignDrafts({});
        setBulkFollowUpProgress(null);
        const skippedLabel = skipped > 0 ? ` ${skipped} não foram enviados porque já saíram da fila.` : "";
        toast(`${sent} ${sent === 1 ? "rechame enviado" : "rechames enviados"}.${skippedLabel}`, "success");
      } else {
        toast(`${sent} enviados e ${failedIds.length} com falha. As falhas continuam selecionadas.`, "error");
      }
    } finally {
      setBulkFollowUpSending(false);
    }
  };

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
              <div className="mt-4 flex flex-col gap-3 border-t border-border/70 pt-4 xl:flex-row xl:items-end xl:justify-between">
                <div className="flex min-w-0 items-center gap-2">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <UsersRound className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-black text-foreground">Rechame em lote</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {selectedConversationIds.length} de {MAX_BULK_FOLLOW_UP_CONVERSATIONS} selecionados
                      {activeCampaignFilter ? ` · ${activeCampaignFilter.label}` : " · mensagem por campanha"}
                    </p>
                  </div>
                </div>
                <div className="flex w-full flex-col gap-3 xl:w-auto xl:flex-row xl:items-end">
                  <label className="block min-w-0 xl:w-64">
                    <span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                      Filtrar por anúncio
                    </span>
                    <span className="relative block">
                      <Megaphone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary" />
                      <select
                        value={campaignFilterKey}
                        onChange={(event) => changeCampaignFilter(event.target.value)}
                        disabled={loading || bulkFollowUpSending}
                        aria-label="Filtrar contatos por anúncio"
                        title="Usa o rótulo roxo exibido em cada contato"
                        className="min-h-11 w-full appearance-none rounded-xl border border-border bg-background py-2 pl-10 pr-9 text-sm font-bold text-foreground outline-none transition-colors focus:border-primary/60 focus:ring-2 focus:ring-primary/15 disabled:opacity-50"
                      >
                        <option value={ALL_CAMPAIGNS_KEY}>Todos os anúncios ({conversations.length})</option>
                        {campaignFilterOptions.map((option) => (
                          <option key={option.key} value={option.key}>
                            {option.label} ({option.count})
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    </span>
                  </label>
                  <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
                    <button
                      type="button"
                      onClick={selectFirstAvailableConversations}
                      disabled={loading || filteredConversations.length === 0 || bulkFollowUpSending}
                      className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border bg-background px-3 text-xs font-black text-foreground transition-colors hover:bg-muted disabled:opacity-50"
                    >
                      Selecionar 10
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedConversationIds([])}
                      disabled={selectedConversationIds.length === 0 || bulkFollowUpSending}
                      className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border bg-background px-3 text-xs font-black text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
                    >
                      Limpar
                    </button>
                    <button
                      type="button"
                      onClick={() => setBulkComposerOpen(true)}
                      disabled={selectedConversationIds.length === 0 || bulkFollowUpSending}
                      className="col-span-2 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-black text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                    >
                      <MessageSquareText className="h-4 w-4" />
                      Preparar mensagens
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {loading ? (
              <div className="flex min-h-72 flex-col items-center justify-center gap-3 p-8 text-center">
                <Loader2 className="h-7 w-7 animate-spin text-primary" />
                <p className="text-sm font-semibold text-muted-foreground">Organizando a fila de Osasco...</p>
              </div>
            ) : filteredConversations.length === 0 ? (
              <div className="flex min-h-72 flex-col items-center justify-center p-8 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-300">
                  <CheckCircle2 className="h-6 w-6" />
                </div>
                <h3 className="mt-4 font-black text-foreground">
                  {activeCampaignFilter ? "Nenhum contato carregado neste anúncio" : "Nenhum contato nesta faixa"}
                </h3>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                  {activeCampaignFilter
                    ? "Escolha outro anúncio ou carregue mais contatos para ampliar a busca."
                    : "Escolha outro filtro para consultar o restante do estoque."}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border/70">
                {filteredConversations.map((conversation) => {
                  const contactLabel = conversation.contact.name || formatPhone(conversation.contact.phone);
                  const age = agePresentation(conversation.callbackDueAt, clockNow);
                  const inboxParams = new URLSearchParams(scopedSearchParams);
                  inboxParams.set("unit", FOLLOW_UP_CENTER_PILOT_UNIT);
                  inboxParams.set("targetInstanceId", conversation.instanceId);
                  inboxParams.delete("targetUserId");
                  inboxParams.set("conversationId", conversation.id);
                  inboxParams.set("queue", "callback");
                  const conversationHref = `/crm/inbox?${inboxParams.toString()}`;
                  const selected = selectedConversationIdSet.has(conversation.id);

                  return (
                    <article
                      key={conversation.id}
                      className={`p-4 transition-colors sm:p-5 ${selected ? "bg-primary/5" : "hover:bg-muted/20"}`}
                    >
                      <div className="flex flex-col gap-4 xl:grid xl:grid-cols-[minmax(260px,1.1fr)_minmax(220px,1fr)_minmax(300px,1.2fr)_auto] xl:items-center">
                        <div className="flex min-w-0 items-start gap-3">
                          <button
                            type="button"
                            onClick={() => toggleConversationSelection(conversation)}
                            disabled={!conversation.canReply || bulkFollowUpSending}
                            aria-pressed={selected}
                            aria-label={selected ? `Remover ${contactLabel} da seleção` : `Selecionar ${contactLabel}`}
                            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition-colors sm:h-12 sm:w-12 ${
                              selected
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-primary"
                            } disabled:cursor-not-allowed disabled:opacity-40`}
                          >
                            {selected ? <Check className="h-5 w-5" /> : <span className="h-5 w-5 rounded border-2 border-current" />}
                          </button>
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
                            <p className="mt-1 inline-flex max-w-full rounded-full bg-violet-500/10 px-2 py-0.5 text-[10px] font-black text-violet-700 dark:text-violet-300">
                              <span className="truncate">{conversation.campaignName || "Sem campanha"}</span>
                            </p>
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
                  {activeCampaignFilter
                    ? `${filteredConversations.length.toLocaleString("pt-BR")} de ${conversations.length.toLocaleString("pt-BR")} contatos carregados neste anúncio.`
                    : `${conversations.length.toLocaleString("pt-BR")} contatos exibidos em ${selectedBucket.label.toLowerCase()}.`}
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

      {bulkComposerOpen && !savedReplyCampaignKey && (
        <div
          className="fixed inset-0 z-40 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !bulkFollowUpSending) setBulkComposerOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="bulk-follow-up-title"
            className="flex max-h-[94dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-border bg-card shadow-2xl sm:max-w-3xl sm:rounded-3xl"
          >
            <div className="flex shrink-0 items-start gap-3 border-b border-border/70 px-4 py-4 sm:px-6">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <UsersRound className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 id="bulk-follow-up-title" className="text-base font-black text-foreground sm:text-lg">
                  Rechame por campanha
                </h2>
                <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                  {selectedConversations.length} contatos em {campaignGroups.length} {campaignGroups.length === 1 ? "campanha" : "campanhas"}. Cada texto será personalizado no envio.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setBulkComposerOpen(false)}
                disabled={bulkFollowUpSending}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
                aria-label="Fechar preparação do lote"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
              {campaignGroups.map((group) => {
                const draft = campaignDrafts[group.key] || "";
                const preview = campaignPreview(group);
                const sampleContact = group.conversations[0];
                return (
                  <section key={group.key} className="overflow-hidden rounded-2xl border border-border/80 bg-background/55">
                    <div className="flex flex-col gap-3 border-b border-border/70 p-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black text-foreground">
                          {group.campaignName || "Sem campanha"}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {group.conversations.length} {group.conversations.length === 1 ? "contato selecionado" : "contatos selecionados"}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSavedReplyCampaignKey(group.key)}
                        disabled={bulkFollowUpSending}
                        className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-border bg-card px-3 text-xs font-black text-foreground transition-colors hover:bg-muted disabled:opacity-50"
                      >
                        <MessageSquareText className="h-4 w-4" />
                        Usar resposta rápida
                      </button>
                    </div>
                    <div className="space-y-3 p-4">
                      <label className="block">
                        <span className="mb-1.5 block text-xs font-black text-foreground">Mensagem desta campanha</span>
                        <textarea
                          value={draft}
                          onChange={(event) => updateCampaignDraft(group.key, event.target.value)}
                          disabled={bulkFollowUpSending}
                          rows={5}
                          maxLength={4096}
                          lang="pt-BR"
                          spellCheck
                          autoCorrect="on"
                          autoCapitalize="sentences"
                          placeholder={`Escreva o rechame para ${group.campaignName || "os contatos sem campanha"}...`}
                          className="min-h-32 w-full resize-y rounded-xl border border-border bg-card px-3 py-2.5 text-sm leading-6 text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/40 focus:ring-1 focus:ring-primary/25 disabled:opacity-60"
                        />
                      </label>
                      <div className={`rounded-xl border p-3 ${draft.trim() ? "border-emerald-500/20 bg-emerald-500/5" : "border-amber-500/20 bg-amber-500/5"}`}>
                        <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                          {draft.trim()
                            ? `Prévia para ${sampleContact.contact.name || formatPhone(sampleContact.contact.phone)}`
                            : "Mensagem obrigatória"}
                        </p>
                        <p className="mt-1 max-h-28 overflow-y-auto whitespace-pre-wrap break-words text-xs leading-5 text-foreground">
                          {draft.trim() ? preview : "Escolha uma resposta rápida ou escreva o texto antes de enviar."}
                        </p>
                      </div>
                    </div>
                  </section>
                );
              })}

              {bulkFollowUpProgress && (
                <section className="rounded-2xl border border-border bg-background/70 p-4">
                  <div className="flex items-center justify-between gap-3 text-xs font-black text-foreground">
                    <span>{bulkFollowUpProgress.completed} de {bulkFollowUpProgress.total}</span>
                    <span>
                      {bulkFollowUpProgress.sent} enviados
                      {bulkFollowUpProgress.failed > 0 ? ` · ${bulkFollowUpProgress.failed} falharam` : ""}
                      {bulkFollowUpProgress.skipped > 0 ? ` · ${bulkFollowUpProgress.skipped} saíram da fila` : ""}
                    </span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-[width] duration-300"
                      style={{ width: `${(bulkFollowUpProgress.completed / bulkFollowUpProgress.total) * 100}%` }}
                    />
                  </div>
                </section>
              )}
            </div>

            <div className="shrink-0 border-t border-border/70 bg-card px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-4">
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-center text-[11px] leading-4 text-muted-foreground sm:max-w-sm sm:text-left">
                  O sistema confere novamente se o lead continua sem resposta e envia um contato por vez.
                </p>
                <button
                  type="button"
                  onClick={() => void sendBulkFollowUp()}
                  disabled={bulkFollowUpSending || !allCampaignDraftsReady}
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 text-sm font-black text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-11"
                >
                  {bulkFollowUpSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  {bulkFollowUpSending ? "Enviando..." : `Enviar ${selectedConversations.length} rechames`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <SavedRepliesDialog
        open={Boolean(savedReplyCampaign)}
        draftText={savedReplyCampaign ? campaignDrafts[savedReplyCampaign.key] || "" : ""}
        library={savedRepliesLibrary}
        campaignName={savedReplyCampaign?.campaignName}
        onOpenChange={(open) => {
          if (!open) setSavedReplyCampaignKey(null);
        }}
        onSelect={(content) => {
          if (savedReplyCampaign) updateCampaignDraft(savedReplyCampaign.key, content);
          setSavedReplyCampaignKey(null);
          toast("Resposta aplicada à campanha.", "success");
        }}
      />
    </div>
  );
}
