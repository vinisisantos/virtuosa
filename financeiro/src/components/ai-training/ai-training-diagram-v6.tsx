"use client";
/* eslint-disable @next/next/no-img-element -- o criativo pode usar URL privada assinada */

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  CalendarDays,
  Dices,
  ImageIcon,
  Loader2,
  Megaphone,
  Play,
  RefreshCw,
  Send,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import {
  AI_TRAINING_DIAGRAM_V6_RUNTIME,
  isAiTrainingDiagramV6State,
  type AiTrainingDiagramV6Family,
  type AiTrainingDiagramV6MediaKey,
  type AiTrainingDiagramV6State,
} from "@/lib/ai-training-diagram-v6";

type CampaignOption = {
  id: string;
  name: string;
  unit: string;
  status: string;
  objective?: string | null;
  offerItems: Array<{ procedureName: string; includedSessions: number }>;
  creativeId?: string | null;
};

type ConversationSummary = {
  id: string;
  unit: string;
  title?: string | null;
  updatedAt: string;
  campaign?: { id: string; name: string; status: string } | null;
  _count: { messages: number };
  messages: Array<{ content: string; role: string; createdAt: string }>;
};

type DiagramMessage = {
  id: string;
  role: "client" | "assistant";
  content: string;
  model?: string | null;
  guardrailFlags?: string[] | null;
  sdrAudit?: unknown;
  createdAt: string;
};

type DiagramConversation = {
  id: string;
  unit: string;
  runtimeVersion: string;
  title?: string | null;
  replyDueAt?: string | null;
  replyStatus: "idle" | "pending" | "processing" | "failed";
  replyVersion: number;
  conversationState?: unknown;
  campaign?: {
    id: string;
    name: string;
    status: string;
    objective?: string | null;
    offerItems: Array<{ procedureName: string; includedSessions: number }>;
  } | null;
  campaignCreative?: {
    id: string;
    label: string;
    imagePreviewUrl?: string | null;
    campaign: { name: string };
  } | null;
  messages: DiagramMessage[];
};

const GENERIC_MEDIA: Record<AiTrainingDiagramV6MediaKey, string> = {
  campaign: "/ai-training/diagram-v6/campaign-general.webp",
  "body-proof": "/ai-training/diagram-v6/proof-body.webp",
  "facial-proof": "/ai-training/diagram-v6/proof-facial.webp",
  "facial-lips": "/ai-training/diagram-v6/proof-facial.webp",
  "facial-under-eyes": "/ai-training/diagram-v6/proof-facial.webp",
  "facial-nasolabial": "/ai-training/diagram-v6/proof-facial.webp",
};

function formatDate(value?: string | null) {
  if (!value) return "";
  return new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

async function responseData(response: Response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Não foi possível concluir a ação.");
  return data;
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function diagramState(value: unknown): AiTrainingDiagramV6State | null {
  return isAiTrainingDiagramV6State(value) ? value : null;
}

function messageMediaKey(value: unknown): AiTrainingDiagramV6MediaKey | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const diagram = (value as { diagramV6?: unknown }).diagramV6;
  if (!diagram || typeof diagram !== "object" || Array.isArray(diagram)) return null;
  const mediaKey = (diagram as { mediaKey?: unknown }).mediaKey;
  return typeof mediaKey === "string" && mediaKey in GENERIC_MEDIA
    ? mediaKey as AiTrainingDiagramV6MediaKey
    : null;
}

function messageSource(value: unknown): "scripted" | "model" | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = (value as { source?: unknown }).source;
  return source === "scripted" || source === "model" ? source : null;
}

function familyLabel(family?: AiTrainingDiagramV6Family) {
  if (family === "body") return "Fluxo corporal";
  if (family === "facial") return "Fluxo facial";
  return "Fluxo geral";
}

function statusLabel(state: AiTrainingDiagramV6State | null) {
  if (state?.crmStatus === "agendado") return "Agendado";
  if (state?.crmStatus === "finalizado") return "Finalizado";
  return "Em atendimento";
}

function genericCampaignMedia(family?: AiTrainingDiagramV6Family) {
  if (family === "body") return "/ai-training/diagram-v6/campaign-body.webp";
  if (family === "facial") return "/ai-training/diagram-v6/campaign-facial.webp";
  return GENERIC_MEDIA.campaign;
}

function mediaForMessage(message: DiagramMessage, conversation: DiagramConversation, state: AiTrainingDiagramV6State | null) {
  const key = messageMediaKey(message.sdrAudit);
  if (!key) return null;
  if (key === "campaign") {
    return {
      src: conversation.campaignCreative?.imagePreviewUrl || genericCampaignMedia(state?.family),
      label: conversation.campaignCreative?.imagePreviewUrl ? "Criativo aprovado da campanha" : "Imagem genérica da simulação",
      illustrative: !conversation.campaignCreative?.imagePreviewUrl,
    };
  }
  return { src: GENERIC_MEDIA[key], label: "Prova visual genérica da simulação", illustrative: true };
}

export function AiTrainingDiagramV6() {
  const [campaigns, setCampaigns] = useState<CampaignOption[]>([]);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState("");
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [conversation, setConversation] = useState<DiagramConversation | null>(null);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingConversation, setLoadingConversation] = useState(false);
  const [creating, setCreating] = useState<"manual" | "random" | null>(null);
  const [sending, setSending] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [advancingFollowUp, setAdvancingFollowUp] = useState(false);
  const [replyCountdown, setReplyCountdown] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const messagesViewportRef = useRef<HTMLDivElement>(null);
  const generationRequestsRef = useRef(new Set<string>());

  const activeCampaigns = useMemo(() => campaigns.filter((campaign) => campaign.status === "ativa"), [campaigns]);
  const selectedCampaign = useMemo(
    () => campaigns.find((campaign) => campaign.id === selectedCampaignId) || null,
    [campaigns, selectedCampaignId],
  );
  const state = diagramState(conversation?.conversationState);

  const loadConversations = useCallback(async (preferredId?: string | null) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ runtimeVersion: AI_TRAINING_DIAGRAM_V6_RUNTIME, unit: "Osasco" });
      const data = await responseData(await fetch(`/api/crm/ai-shadow/training/conversations?${params}`));
      const nextConversations: ConversationSummary[] = data.conversations || [];
      const nextCampaigns: CampaignOption[] = data.campaigns || [];
      setConversations(nextConversations);
      setCampaigns(nextCampaigns);
      setSelectedCampaignId((current) => {
        if (current && nextCampaigns.some((campaign) => campaign.id === current)) return current;
        return nextCampaigns.find((campaign) => campaign.status === "ativa")?.id || nextCampaigns[0]?.id || "";
      });
      setActiveConversationId((current) => {
        if (preferredId && nextConversations.some((item) => item.id === preferredId)) return preferredId;
        if (current && nextConversations.some((item) => item.id === current)) return current;
        return nextConversations[0]?.id || null;
      });
    } catch (error: unknown) {
      setError(errorMessage(error, "Falha ao carregar a V6 Diagrama."));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadConversation = useCallback(async (conversationId: string) => {
    setLoadingConversation(true);
    setError(null);
    try {
      const data = await responseData(await fetch(`/api/crm/ai-shadow/training/conversations/${conversationId}`));
      setConversation(data.conversation || null);
    } catch (error: unknown) {
      setError(errorMessage(error, "Falha ao carregar a simulação V6."));
    } finally {
      setLoadingConversation(false);
    }
  }, []);

  const generateReply = useCallback(async (conversationId: string, replyVersion: number, retry = false) => {
    const requestKey = `${conversationId}:${replyVersion}`;
    if (generationRequestsRef.current.has(requestKey)) return;
    generationRequestsRef.current.add(requestKey);
    setGenerating(true);
    setReplyCountdown(null);
    setNotice(null);
    setError(null);
    try {
      const data = await responseData(await fetch("/api/crm/ai-shadow/training/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, replyVersion, retry, includeExperimentalCaderno: false }),
      }));
      if (data.status === "generated") {
        setNotice(data.generation?.model === "deterministic:diagram-v6"
          ? "Passo executado pelo roteiro determinístico da V6."
          : "Pergunta fora do roteiro respondida pela IA; o ponto pendente foi retomado.");
      }
      await Promise.all([loadConversation(conversationId), loadConversations(conversationId)]);
    } catch (error: unknown) {
      setError(errorMessage(error, "A V6 não conseguiu responder."));
      await loadConversation(conversationId);
    } finally {
      generationRequestsRef.current.delete(requestKey);
      setGenerating(generationRequestsRef.current.size > 0);
    }
  }, [loadConversation, loadConversations]);

  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    if (activeConversationId) void loadConversation(activeConversationId);
    else setConversation(null);
  }, [activeConversationId, loadConversation]);

  useEffect(() => {
    const viewport = messagesViewportRef.current;
    if (!viewport) return;
    const frame = window.requestAnimationFrame(() => {
      viewport.scrollTo({ top: viewport.scrollHeight, behavior: "smooth" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [conversation?.id, conversation?.messages.length, sending, generating]);

  useEffect(() => {
    if (!conversation?.replyDueAt || !["pending", "processing"].includes(conversation.replyStatus)) {
      setReplyCountdown(null);
      return;
    }
    const dueAt = new Date(conversation.replyDueAt).getTime();
    const updateCountdown = () => {
      setReplyCountdown(conversation.replyStatus === "pending"
        ? Math.max(0, Math.ceil((dueAt - Date.now()) / 1000))
        : null);
    };
    updateCountdown();
    const interval = window.setInterval(updateCountdown, 1000);
    const timeout = window.setTimeout(() => {
      void generateReply(conversation.id, conversation.replyVersion);
    }, Math.max(0, dueAt - Date.now()));
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, [conversation?.id, conversation?.replyDueAt, conversation?.replyStatus, conversation?.replyVersion, generateReply]);

  async function createConversation(selectionMode: "manual" | "random") {
    if (selectionMode === "manual" && !selectedCampaignId) return;
    setCreating(selectionMode);
    setNotice(null);
    setError(null);
    try {
      const data = await responseData(await fetch("/api/crm/ai-shadow/training/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          unit: "Osasco",
          runtimeVersion: AI_TRAINING_DIAGRAM_V6_RUNTIME,
          selectionMode,
          campaignId: selectionMode === "manual" ? selectedCampaignId : undefined,
        }),
      }));
      const id = data.conversation.id as string;
      if (data.campaign?.id) setSelectedCampaignId(data.campaign.id);
      await loadConversations(id);
      setActiveConversationId(id);
      setNotice(selectionMode === "random"
        ? `Campanha sorteada: ${data.campaign.name}. A conversa foi congelada nesse cenário.`
        : `Simulação iniciada com ${data.campaign.name}.`);
    } catch (error: unknown) {
      setError(errorMessage(error, "Falha ao iniciar a simulação V6."));
    } finally {
      setCreating(null);
    }
  }

  async function sendMessage(event: FormEvent) {
    event.preventDefault();
    const content = draft.trim();
    if (!content || !conversation || sending) return;
    setSending(true);
    setNotice(null);
    setError(null);
    setDraft("");
    try {
      await responseData(await fetch("/api/crm/ai-shadow/training/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: conversation.id, content }),
      }));
      setNotice("Mensagem registrada. A V6 aguardará 20 segundos por complementos.");
      await Promise.all([loadConversation(conversation.id), loadConversations(conversation.id)]);
    } catch (error: unknown) {
      setDraft(content);
      setError(errorMessage(error, "Não foi possível registrar a mensagem."));
      await loadConversation(conversation.id);
    } finally {
      setSending(false);
    }
  }

  async function advanceFollowUp() {
    if (!conversation || advancingFollowUp) return;
    setAdvancingFollowUp(true);
    setNotice(null);
    setError(null);
    try {
      const data = await responseData(await fetch("/api/crm/ai-shadow/training/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: conversation.id, action: "advance_follow_up" }),
      }));
      const nextState = diagramState(data.followUp?.state);
      setNotice(nextState?.outcome === "finalized"
        ? "Simulação finalizada por ausência de resposta."
        : `Follow-up do Dia ${nextState?.followUpDay || "seguinte"} inserido manualmente.`);
      await Promise.all([loadConversation(conversation.id), loadConversations(conversation.id)]);
    } catch (error: unknown) {
      setError(errorMessage(error, "Não foi possível avançar o follow-up."));
    } finally {
      setAdvancingFollowUp(false);
    }
  }

  const replyPending = conversation?.replyStatus === "pending";
  const replyProcessing = conversation?.replyStatus === "processing";
  const replyFailed = conversation?.replyStatus === "failed";
  const followUpLabel = state?.followUpDay === 7 ? "Finalizar sem resposta" : `Simular Dia ${(state?.followUpDay || 1) + 1}`;

  return (
    <div className="grid gap-4">
      <section className="rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/[0.08] via-card to-card p-4 sm:p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
              <ShieldCheck className="h-3.5 w-3.5" />
              Runtime isolado
            </div>
            <h2 className="mt-3 text-xl font-bold">V6 · Diagrama</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Roteiro determinístico baseado no diagrama. CRM, agenda, imagens e follow-ups são simulados; nada é enviado ao WhatsApp.
            </p>
          </div>

          <div className="grid w-full gap-2 sm:grid-cols-[minmax(240px,1fr)_auto_auto] xl:max-w-3xl">
            <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
              Campanha cadastrada em Osasco
              <select
                value={selectedCampaignId}
                onChange={(event) => setSelectedCampaignId(event.target.value)}
                className="h-11 min-w-0 rounded-lg border border-input bg-background px-3 text-sm text-foreground"
              >
                {campaigns.length === 0 && <option value="">Nenhuma campanha cadastrada</option>}
                {campaigns.map((campaign) => (
                  <option key={campaign.id} value={campaign.id}>
                    {campaign.name} · {campaign.status}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() => createConversation("manual")}
              disabled={!selectedCampaignId || creating !== null}
              className="inline-flex min-h-11 items-center justify-center gap-2 self-end rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-50"
            >
              {creating === "manual" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              Iniciar escolhida
            </button>
            <button
              type="button"
              onClick={() => createConversation("random")}
              disabled={activeCampaigns.length === 0 || creating !== null}
              className="inline-flex min-h-11 items-center justify-center gap-2 self-end rounded-lg border border-primary/35 bg-background px-4 text-sm font-bold text-primary disabled:opacity-50"
            >
              {creating === "random" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Dices className="h-4 w-4" />}
              Sortear ativa
            </button>
          </div>
        </div>

        {selectedCampaign && (
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border/70 pt-3 text-xs text-muted-foreground">
            <span className={`rounded-full px-2.5 py-1 font-bold ${selectedCampaign.status === "ativa" ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-muted"}`}>
              {selectedCampaign.status}
            </span>
            <span>{selectedCampaign.offerItems.length > 0
              ? selectedCampaign.offerItems.map((item) => `${item.includedSessions}× ${item.procedureName}`).join(" · ")
              : "Sem itens de oferta cadastrados; a V6 não inventará composição."}</span>
          </div>
        )}
      </section>

      {(notice || error) && (
        <div className={`rounded-xl border px-4 py-3 text-sm ${error ? "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"}`}>
          {error || notice}
        </div>
      )}

      <div className="grid h-[calc(100dvh-14rem)] min-h-[680px] max-h-[900px] grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-2xl border border-border bg-card lg:grid-cols-[300px_minmax(0,1fr)] lg:grid-rows-1">
        <aside className="flex max-h-60 min-h-0 flex-col overflow-hidden border-b border-border bg-muted/20 lg:h-full lg:max-h-none lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between gap-3 border-b border-border p-3 sm:p-4">
            <div>
              <div className="text-sm font-bold">Simulações V6</div>
              <div className="text-xs text-muted-foreground">Histórico separado da IA atual.</div>
            </div>
            <button
              type="button"
              onClick={() => loadConversations(activeConversationId)}
              className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-muted"
              aria-label="Atualizar campanhas e simulações"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
          <div className="max-h-48 flex-1 overflow-y-auto p-2 lg:max-h-none">
            {loading ? (
              <div className="flex h-28 items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Carregando</div>
            ) : conversations.length === 0 ? (
              <div className="m-2 rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
                Escolha ou sorteie uma campanha para criar a primeira simulação.
              </div>
            ) : conversations.map((item) => {
              const active = item.id === activeConversationId;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveConversationId(item.id)}
                  className={`mb-1 w-full rounded-xl border px-3 py-3 text-left transition-colors ${active ? "border-primary/40 bg-primary/10" : "border-transparent hover:bg-muted"}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold">{item.campaign?.name || item.title || "Simulação V6"}</span>
                    <span className="rounded-full bg-background px-2 py-0.5 text-[10px] font-bold text-muted-foreground">V6</span>
                  </div>
                  <div className="mt-1 truncate text-xs text-muted-foreground">{item.messages[0]?.content || "Sem mensagens"}</div>
                  <div className="mt-2 text-[10px] text-muted-foreground/70">{item._count.messages} mensagens · {formatDate(item.updatedAt)}</div>
                </button>
              );
            })}
          </div>
        </aside>

        <section className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
          <header className="border-b border-border px-3 py-3 sm:px-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><Bot className="h-5 w-5" /></div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-bold">{conversation?.campaign?.name || "V6 · Diagrama"}</div>
                  <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    <span>{familyLabel(state?.family)}</span>
                    <span>·</span>
                    <span>Dia {state?.followUpDay || 1}</span>
                  </div>
                </div>
              </div>
              {conversation && state && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${state.crmStatus === "agendado" ? "bg-blue-500/10 text-blue-600 dark:text-blue-300" : state.crmStatus === "finalizado" ? "bg-slate-500/10 text-slate-600 dark:text-slate-300" : "bg-amber-500/10 text-amber-700 dark:text-amber-300"}`}>
                    CRM simulado · {statusLabel(state)}
                  </span>
                  {state.outcome === "active" && (
                    <button
                      type="button"
                      onClick={advanceFollowUp}
                      disabled={advancingFollowUp || replyPending || replyProcessing || generating}
                      className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-3 text-xs font-bold text-muted-foreground hover:bg-muted disabled:opacity-50"
                    >
                      {advancingFollowUp ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarDays className="h-4 w-4" />}
                      {followUpLabel}
                    </button>
                  )}
                </div>
              )}
            </div>
          </header>

          <div ref={messagesViewportRef} className="flex-1 space-y-4 overflow-y-auto bg-muted/10 p-3 sm:p-5">
            {loadingConversation ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Carregando simulação</div>
            ) : !conversation ? (
              <div className="flex h-full items-center justify-center">
                <div className="max-w-md rounded-2xl border border-dashed border-border bg-card p-6 text-center">
                  <Dices className="mx-auto h-8 w-8 text-primary" />
                  <div className="mt-3 font-bold">Escolha ou sorteie uma campanha</div>
                  <p className="mt-1 text-sm text-muted-foreground">A conversa começará com três balões do roteiro e um CRM inteiramente simulado.</p>
                </div>
              </div>
            ) : conversation.messages.map((message) => {
              const isClient = message.role === "client";
              const media = mediaForMessage(message, conversation, state);
              const source = messageSource(message.sdrAudit);
              return (
                <div key={message.id} className={`flex gap-2 ${isClient ? "justify-end" : "justify-start"}`}>
                  {!isClient && <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><Bot className="h-4 w-4" /></div>}
                  <div className={`flex max-w-[90%] flex-col sm:max-w-[74%] ${isClient ? "items-end" : "items-start"}`}>
                    <div className="mb-1 flex items-center gap-2 px-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                      {isClient ? <><UserRound className="h-3 w-3" />Cliente simulado</> : <><ShieldCheck className="h-3 w-3" />V6 · Diagrama</>}
                    </div>
                    <div className={`overflow-hidden rounded-2xl text-sm leading-relaxed ${isClient ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-bl-md border border-border bg-background"}`}>
                      {media && (
                        <figure className="relative border-b border-border">
                          <img src={media.src} alt={media.label} className="aspect-[16/10] w-full object-cover" />
                          <figcaption className="absolute inset-x-2 bottom-2 rounded-lg bg-black/75 px-2 py-1 text-[10px] font-bold text-white backdrop-blur-sm">
                            {media.illustrative ? "IMAGEM ILUSTRATIVA · SOMENTE TESTE" : "CRIATIVO APROVADO DA CAMPANHA"}
                          </figcaption>
                        </figure>
                      )}
                      <div className="whitespace-pre-wrap px-4 py-3">{message.content}</div>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1 px-1 text-[10px] text-muted-foreground">
                      <span>{formatDate(message.createdAt)}</span>
                      {(source === "scripted" || message.model?.startsWith("deterministic:")) && <span className="rounded-full bg-primary/10 px-1.5 py-0.5 font-bold text-primary">roteiro</span>}
                      {source === "model" && <span className="rounded-full bg-violet-500/10 px-1.5 py-0.5 font-bold text-violet-600 dark:text-violet-300">pergunta fora do roteiro</span>}
                    </div>
                  </div>
                </div>
              );
            })}

            {(sending || generating || replyPending || replyProcessing) && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary"><Bot className="h-4 w-4" /></div>
                {(sending || generating || replyProcessing) && <Loader2 className="h-4 w-4 animate-spin" />}
                {sending
                  ? "Registrando a mensagem…"
                  : generating || replyProcessing
                    ? "A V6 está verificando o passo pendente…"
                    : `Aguardando ${replyCountdown ?? 20}s por complementos…`}
              </div>
            )}
            {replyFailed && conversation && (
              <div className="flex flex-col gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300 sm:flex-row sm:items-center">
                <span className="flex-1">A geração falhou. O estado do roteiro foi preservado.</span>
                <button
                  type="button"
                  onClick={() => generateReply(conversation.id, conversation.replyVersion, true)}
                  disabled={generating}
                  className="min-h-11 rounded-lg border border-red-500/30 px-3 text-xs font-bold"
                >
                  Tentar novamente
                </button>
              </div>
            )}
          </div>

          <form onSubmit={sendMessage} className="border-t border-border bg-card p-3 sm:p-4">
            <div className="flex items-end gap-2 rounded-xl border border-input bg-background p-2 focus-within:border-primary">
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
                rows={1}
                placeholder={state?.outcome === "active" ? "Responda como o cliente…" : "Esta simulação foi encerrada"}
                disabled={!conversation || state?.outcome !== "active"}
                className="h-12 min-h-12 max-h-28 flex-1 resize-none overflow-y-auto bg-transparent px-2 py-2 text-sm outline-none placeholder:text-muted-foreground disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={sending || !draft.trim() || !conversation || state?.outcome !== "active"}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground disabled:opacity-50"
                aria-label="Enviar mensagem simulada"
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-center gap-2 text-[10px] text-muted-foreground">
              <span className="inline-flex items-center gap-1"><Megaphone className="h-3 w-3" />Campanha puxada do sistema</span>
              <span>·</span>
              <span className="inline-flex items-center gap-1"><ImageIcon className="h-3 w-3" />Mídia marcada como teste</span>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}
