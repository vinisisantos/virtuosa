"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { Bot, Check, Dices, Loader2, LockKeyhole, Megaphone, MessageCircle, RefreshCw, RotateCcw, Send, ShieldCheck, Sparkles, ThumbsDown, ThumbsUp, UserRound, X } from "lucide-react";
import { parseAiPublicInlineGuidance } from "@/lib/ai-public-inline-guidance";

type PublicTest = {
  title: string;
  unit: string;
  expiresAt: string;
  maxRepliesPerSession: number;
  remainingReplies: number;
};

type PublicMessage = {
  id: string;
  role: "client" | "assistant";
  content: string;
  feedbackRating?: "helpful" | "not_helpful" | null;
  feedbackComment?: string | null;
  replyToMessageIds?: string[];
  revisionOfMessageId?: string | null;
  revisionMode?: "suggestion" | "exact" | null;
  media?: {
    id: string;
    type: "image";
    url: string;
    title: string;
    alt: string;
    caption: string;
  } | null;
  createdAt: string;
};

type RevisionMode = "suggestion" | "exact";
type RevisingAction = RevisionMode | "regenerate";

type Limits = { repliesUsed: number; repliesAllowed: number };
type SimulationCampaign = { id: string; name: string; label: string };

type PendingClientMessage = {
  clientMessageId: string;
  optimisticId: string;
  content: string;
  createdAt: string;
};

const AI_REPLY_DEBOUNCE_MS = 10_000;
const AI_PUBLIC_TEST_MAX_BATCH_MESSAGES = 5;
const AI_PUBLIC_TEST_MAX_BATCH_CHARS = 4000;

const STARTER_QUESTIONS = [
  "Como funciona o HyperSlim?",
  "O que está incluído na Barriga Trincada?",
  "Como funciona o preenchimento facial?",
];

async function responseData(response: Response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Não foi possível concluir a ação.");
  return data;
}

function assistantParagraphs(content: string) {
  const normalized = content.trim().replace(/\n{3,}/g, "\n\n");
  const explicitParagraphs = normalized.split(/\n+/).map((paragraph) => paragraph.trim()).filter(Boolean);
  const visuallyOrganizedParagraphs = explicitParagraphs.flatMap((paragraph) => {
    if (paragraph.length < 160) return [paragraph];
    const sentences = paragraph
      .match(/[^.!?]+(?:[.!?]+|$)/g)
      ?.map((sentence) => sentence.trim())
      .filter(Boolean) || [];
    return sentences.length >= 3 ? sentences : [paragraph];
  });
  if (visuallyOrganizedParagraphs.length > 1) return visuallyOrganizedParagraphs;

  const finalQuestion = normalized.match(/^([\s\S]+[.!;:])\s+([^.!?\n]+\?)$/);
  if (finalQuestion && finalQuestion[1].trim().length >= 30) {
    return [finalQuestion[1].trim(), finalQuestion[2].trim()];
  }
  return normalized ? [normalized] : [];
}

function replyContextForMessage(messages: PublicMessage[], assistantMessage: PublicMessage) {
  const referencedIds = new Set(assistantMessage.replyToMessageIds || []);
  if (referencedIds.size === 0) return [];
  return messages.filter((message) => message.role === "client" && referencedIds.has(message.id));
}

function compactMessagePreview(content: string) {
  const normalized = content.replace(/\s+/g, " ").trim();
  return normalized.length > 110 ? `${normalized.slice(0, 109)}…` : normalized;
}

export default function PublicAiTestPage() {
  const { token: routeToken } = useParams<{ token: string }>();
  const [token, setToken] = useState("");
  const [test, setTest] = useState<PublicTest | null>(null);
  const [messages, setMessages] = useState<PublicMessage[]>([]);
  const [limits, setLimits] = useState<Limits>({ repliesUsed: 0, repliesAllowed: 20 });
  const [draft, setDraft] = useState("");
  const [pendingMessages, setPendingMessages] = useState<PendingClientMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [pendingRetryPaused, setPendingRetryPaused] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [confirmingSimulation, setConfirmingSimulation] = useState(false);
  const [simulationCampaign, setSimulationCampaign] = useState<SimulationCampaign | null>(null);
  const [simulationCampaignOptions, setSimulationCampaignOptions] = useState<SimulationCampaign[]>([]);
  const [selectedSimulationCampaignId, setSelectedSimulationCampaignId] = useState("");
  const [sessionReady, setSessionReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedbackMessageId, setFeedbackMessageId] = useState<string | null>(null);
  const [feedbackComment, setFeedbackComment] = useState("");
  const [revisingMessageId, setRevisingMessageId] = useState<string | null>(null);
  const [revisingMode, setRevisingMode] = useState<RevisingAction | null>(null);
  const [feedbackNotice, setFeedbackNotice] = useState<string | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const hashToken = window.location.hash.replace(/^#/, "").trim();
    const resolved = hashToken || (routeToken !== "acesso" ? routeToken : "");
    if (/^[A-Za-z0-9_-]{32,100}$/.test(resolved)) {
      setToken(resolved);
      return;
    }
    setError("Este endereço de teste é inválido.");
    setLoading(false);
  }, [routeToken]);

  const loadSession = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const authorization = { Authorization: `Bearer ${token}` };
      const metadata = await responseData(await fetch("/api/public/ai-test/acesso", { cache: "no-store", headers: authorization }));
      setTest(metadata.test);
      setLimits((current) => ({ ...current, repliesAllowed: metadata.test.maxRepliesPerSession }));
      await responseData(await fetch("/api/public/ai-test/acesso/session", { method: "POST", headers: authorization }));
      setSessionReady(true);
      const conversation = await responseData(await fetch("/api/public/ai-test/acesso/messages", { cache: "no-store", headers: authorization }));
      setMessages(conversation.messages || []);
      setSimulationCampaign(conversation.campaign || null);
      setSimulationCampaignOptions(conversation.campaignOptions || []);
      setSelectedSimulationCampaignId(conversation.campaign?.id || "");
      setLimits(conversation.limits || { repliesUsed: 0, repliesAllowed: metadata.test.maxRepliesPerSession });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Não foi possível abrir o teste.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const frame = window.requestAnimationFrame(() => viewport.scrollTo({ top: viewport.scrollHeight, behavior: "smooth" }));
    return () => window.cancelAnimationFrame(frame);
  }, [messages.length, pendingMessages.length, sending]);

  const flushPendingMessages = useCallback(async (batch: PendingClientMessage[]) => {
    if (batch.length === 0) return;
    const batchIds = new Set(batch.map((message) => message.clientMessageId));
    const optimisticIds = new Set(batch.map((message) => message.optimisticId));
    setSending(true);
    setError(null);
    setPendingMessages((current) => current.filter((message) => !batchIds.has(message.clientMessageId)));
    try {
      const data = await responseData(await fetch("/api/public/ai-test/acesso/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          messages: batch.map(({ content, clientMessageId }) => ({ content, clientMessageId })),
        }),
      }));
      setMessages((current) => [
        ...(data.messages || []),
        ...current.filter((message) => message.id.startsWith("pending-") && !optimisticIds.has(message.id)),
      ]);
      setPendingRetryPaused(false);
      if (data.limits) setLimits(data.limits);
    } catch (err: unknown) {
      const retryCreatedAt = new Date().toISOString();
      setPendingMessages((current) => [
        ...batch.map((message) => ({ ...message, createdAt: retryCreatedAt })),
        ...current.filter((message) => !batchIds.has(message.clientMessageId)),
      ]);
      setPendingRetryPaused(true);
      setError(err instanceof Error ? err.message : "A IA não conseguiu responder.");
    } finally {
      setSending(false);
    }
  }, [token]);

  useEffect(() => {
    if (!sessionReady || sending || resetting || simulating || pendingRetryPaused || pendingMessages.length === 0) return;
    const batch = pendingMessages.slice(0, AI_PUBLIC_TEST_MAX_BATCH_MESSAGES);
    const lastMessageAt = new Date(batch[batch.length - 1].createdAt).getTime();
    const delay = Math.max(0, AI_REPLY_DEBOUNCE_MS - (Date.now() - lastMessageAt));
    const timer = window.setTimeout(() => void flushPendingMessages(batch), delay);
    return () => window.clearTimeout(timer);
  }, [flushPendingMessages, pendingMessages, pendingRetryPaused, resetting, sending, sessionReady, simulating]);

  function sendMessage(event: FormEvent) {
    event.preventDefault();
    const content = draft.trim();
    const inlineGuidance = parseAiPublicInlineGuidance(content);
    const pendingCharacters = pendingMessages.reduce((total, message) => total + message.content.length, 0);
    const replySlotUnavailable = limits.repliesUsed + (sending ? 1 : 0) >= limits.repliesAllowed;
    if (!content || resetting || simulating || !sessionReady || replySlotUnavailable) return;
    if (inlineGuidance.matched) {
      if (inlineGuidance.error || !inlineGuidance.guidance) {
        setError(inlineGuidance.error || "Escreva a orientação dentro das chaves.");
        return;
      }
      if (pendingMessages.length > 0 || sending) {
        setError("Aguarde a resposta atual antes de enviar uma orientação entre chaves.");
        return;
      }
      const sourceMessage = [...messages].reverse().find((message) => (
        message.role === "assistant" && !message.id.startsWith("pending-")
      ));
      if (!sourceMessage) {
        setError("Envie a orientação entre chaves depois de uma resposta da IA.");
        return;
      }
      setDraft("");
      setError(null);
      setFeedbackNotice(null);
      void reviseResponse(sourceMessage.id, "suggestion", inlineGuidance.guidance);
      return;
    }
    if (pendingMessages.length >= AI_PUBLIC_TEST_MAX_BATCH_MESSAGES) {
      setError(`Aguarde a resposta deste bloco de ${AI_PUBLIC_TEST_MAX_BATCH_MESSAGES} mensagens.`);
      return;
    }
    if (pendingCharacters + content.length > AI_PUBLIC_TEST_MAX_BATCH_CHARS) {
      setError("O conjunto de mensagens ficou muito longo. Aguarde a IA responder antes de continuar.");
      return;
    }

    const clientMessageId = crypto.randomUUID();
    const optimisticId = `pending-${clientMessageId}`;
    const createdAt = new Date().toISOString();
    setDraft("");
    setError(null);
    setFeedbackNotice(null);
    setPendingRetryPaused(false);
    setPendingMessages((current) => [...current, { clientMessageId, optimisticId, content, createdAt }]);
    setMessages((current) => [...current, { id: optimisticId, role: "client", content, createdAt }]);
  }

  async function saveFeedback(messageId: string, rating: "helpful" | "not_helpful", comment = "") {
    setError(null);
    setFeedbackNotice(null);
    try {
      const data = await responseData(await fetch("/api/public/ai-test/acesso/messages", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ messageId, rating, comment }),
      }));
      setMessages((current) => current.map((message) => message.id === messageId
        ? { ...message, feedbackRating: rating, feedbackComment: comment || null }
        : message));
      setFeedbackMessageId(null);
      setFeedbackComment("");
      setFeedbackNotice(data.queuedForReview
        ? "Sugestão confirmada e enviada para aprovação no treinamento."
        : "Avaliação registrada.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar a avaliação.");
    }
  }

  async function reviseResponse(messageId: string, mode: RevisionMode, inlineSuggestion?: string) {
    const suggestion = (inlineSuggestion ?? feedbackComment).trim();
    const inlineCorrection = inlineSuggestion != null;
    if (suggestion.length < 5 || revisingMessageId) return;
    setRevisingMessageId(messageId);
    setRevisingMode(mode);
    setError(null);
    setFeedbackNotice(null);
    try {
      const data = await responseData(await fetch("/api/public/ai-test/acesso/messages", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: "revise", messageId, suggestion, mode }),
      }));
      const revisedMessages = (data.messages || []) as PublicMessage[];
      setMessages(revisedMessages);
      if (data.limits) setLimits(data.limits);
      setFeedbackMessageId(null);
      setFeedbackComment("");
      if (inlineCorrection) {
        const revisedMessage = [...revisedMessages].reverse().find((message) => (
          message.role === "assistant" && message.revisionOfMessageId === messageId
        ));
        if (revisedMessage) {
          try {
            const accepted = await responseData(await fetch("/api/public/ai-test/acesso/messages", {
              method: "PATCH",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
              body: JSON.stringify({
                messageId: revisedMessage.id,
                rating: "helpful",
                comment: "Orientação aplicada por comando entre chaves.",
              }),
            }));
            setMessages((current) => current.map((message) => message.id === revisedMessage.id
              ? { ...message, feedbackRating: "helpful" }
              : message));
            setFeedbackNotice(accepted.queuedForReview
              ? "Orientação aplicada agora, mantida nesta sessão e enviada para aprovação no treinamento."
              : "Orientação aplicada agora e mantida nesta sessão.");
          } catch {
            setFeedbackNotice("A resposta foi corrigida agora, mas a orientação não pôde ser mantida como exemplo da sessão.");
          }
        } else {
          setFeedbackNotice("A resposta foi corrigida com a orientação entre chaves.");
        }
      } else {
        setFeedbackNotice(mode === "exact"
          ? "Seu texto foi definido como a nova resposta. Confirme no positivo se ficou correto."
          : "A resposta foi refeita com sua sugestão. Confirme no positivo se este modelo ficou bom.");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Não foi possível refazer a resposta.");
    } finally {
      setRevisingMessageId(null);
      setRevisingMode(null);
    }
  }

  async function regenerateResponse(messageId: string) {
    if (revisingMessageId) return;
    setRevisingMessageId(messageId);
    setRevisingMode("regenerate");
    setError(null);
    setFeedbackNotice(null);
    try {
      const data = await responseData(await fetch("/api/public/ai-test/acesso/messages", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          action: "regenerate",
          messageId,
          requestId: crypto.randomUUID(),
        }),
      }));
      setMessages((data.messages || []) as PublicMessage[]);
      if (data.limits) setLimits(data.limits);
      setFeedbackMessageId(null);
      setFeedbackComment("");
      setFeedbackNotice("Nova resposta gerada com as regras e os aprendizados mais recentes.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Não foi possível gerar uma nova resposta.");
    } finally {
      setRevisingMessageId(null);
      setRevisingMode(null);
    }
  }

  async function resetConversation() {
    if (resetting || simulating || sending || revisingMessageId) return;
    setResetting(true);
    setError(null);
    try {
      const data = await responseData(await fetch("/api/public/ai-test/acesso/messages", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      }));
      setMessages(data.messages || []);
      setPendingMessages([]);
      setPendingRetryPaused(false);
      if (data.limits) setLimits(data.limits);
      setDraft("");
      setFeedbackMessageId(null);
      setFeedbackComment("");
      setFeedbackNotice(null);
      setConfirmingReset(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Não foi possível reiniciar a conversa.");
    } finally {
      setResetting(false);
    }
  }

  async function simulateLeadArrival() {
    if (simulating || resetting || sending || revisingMessageId || pendingMessages.length > 0) return;
    setSimulating(true);
    setError(null);
    try {
      const data = await responseData(await fetch("/api/public/ai-test/acesso/messages", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          campaignCreativeId: selectedSimulationCampaignId || null,
        }),
      }));
      setMessages(data.messages || []);
      setSimulationCampaign(data.campaign || null);
      setSelectedSimulationCampaignId(data.campaign?.id || "");
      setPendingMessages([]);
      setPendingRetryPaused(false);
      if (data.limits) setLimits(data.limits);
      setDraft("");
      setFeedbackMessageId(null);
      setFeedbackComment("");
      setFeedbackNotice(null);
      setConfirmingSimulation(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Não foi possível iniciar a simulação.");
    } finally {
      setSimulating(false);
    }
  }

  if (loading) {
    return (
      <main className="public-ai-test-page fixed inset-0 flex min-h-dvh items-center justify-center bg-[#070b14] !p-4 text-white">
        <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-sm text-white/70">
          <Loader2 className="h-5 w-5 animate-spin text-fuchsia-400" />Preparando o ambiente de teste
        </div>
      </main>
    );
  }

  if (error && !test) {
    return (
      <main className="public-ai-test-page fixed inset-0 flex min-h-dvh items-center justify-center bg-[#070b14] !p-4 text-white">
        <section className="w-full max-w-md rounded-3xl border border-red-400/20 bg-white/[0.045] p-6 text-center shadow-2xl">
          <LockKeyhole className="mx-auto h-10 w-10 text-red-300" />
          <h1 className="mt-4 text-xl font-bold">Teste indisponível</h1>
          <p className="mt-2 text-sm leading-relaxed text-white/60">{error}</p>
        </section>
      </main>
    );
  }

  const limitReached = limits.repliesUsed >= limits.repliesAllowed;
  const replySlotUnavailable = limits.repliesUsed + (sending ? 1 : 0) >= limits.repliesAllowed;
  const pendingBatchFull = pendingMessages.length >= AI_PUBLIC_TEST_MAX_BATCH_MESSAGES;
  const inputDisabled = resetting || simulating || !!revisingMessageId || !sessionReady || limitReached || replySlotUnavailable || pendingBatchFull;

  return (
    <main className="public-ai-test-page fixed inset-0 min-h-dvh bg-[radial-gradient(circle_at_50%_-10%,_rgba(217,70,239,0.2),_transparent_34%),radial-gradient(circle_at_100%_100%,_rgba(124,58,237,0.12),_transparent_32%),#060913] !p-0 text-white sm:!p-4 lg:!p-6">
      <div className="mx-auto flex h-dvh w-full max-w-5xl flex-col overflow-hidden bg-[#0b101c]/95 shadow-2xl sm:h-[calc(100dvh-2rem)] sm:rounded-[1.75rem] sm:border sm:border-white/10 lg:h-[calc(100dvh-3rem)]">
        <header className="border-b border-white/[0.08] bg-[#0d1321]/90 px-4 pb-3 pt-[max(0.875rem,env(safe-area-inset-top))] backdrop-blur-xl sm:px-6 sm:py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 via-fuchsia-500 to-pink-500 shadow-lg shadow-fuchsia-500/20">
                <Bot className="h-5 w-5" />
                <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-[3px] border-[#0d1321] bg-emerald-400" />
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-[15px] font-extrabold tracking-tight sm:text-lg">{test?.title}</h1>
                <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-white/50 sm:text-xs">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />Teste seguro · {test?.unit}
                </div>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => setConfirmingSimulation(true)}
                disabled={simulating || resetting || sending || !!revisingMessageId || pendingMessages.length > 0 || !sessionReady}
                className="flex h-10 min-w-10 items-center justify-center gap-2 rounded-xl border border-fuchsia-300/15 bg-fuchsia-400/[0.08] px-2.5 text-[11px] font-semibold text-fuchsia-100/80 transition-colors hover:border-fuchsia-300/30 hover:bg-fuchsia-400/[0.14] hover:text-white disabled:cursor-not-allowed disabled:opacity-35 sm:px-3"
                aria-label="Simular chegada de lead"
                title="Simular chegada de lead"
              >
                {simulating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Dices className="h-4 w-4" />}
                <span className="hidden sm:inline">Simular</span>
              </button>
              <button
                type="button"
                onClick={() => setConfirmingReset(true)}
                disabled={resetting || simulating || sending || !!revisingMessageId || messages.length === 0}
                className="flex h-10 min-w-10 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.045] px-2.5 text-[11px] font-semibold text-white/60 transition-colors hover:border-fuchsia-400/25 hover:bg-fuchsia-400/[0.08] hover:text-white disabled:cursor-not-allowed disabled:opacity-35 sm:px-3"
                aria-label="Reiniciar conversa"
                title="Reiniciar conversa"
              >
                {resetting ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                <span className="hidden sm:inline">Reiniciar</span>
              </button>
              <div className="rounded-full border border-white/10 bg-white/[0.045] px-3 py-1.5 text-[11px] font-semibold tabular-nums text-white/55 sm:text-xs">
                {limits.repliesUsed} de {limits.repliesAllowed}
              </div>
            </div>
          </div>
        </header>

        <div className="flex items-start justify-center gap-2 border-b border-amber-300/10 bg-amber-300/[0.045] px-4 py-2.5 text-[10px] leading-relaxed text-amber-100/65 sm:px-6 sm:text-xs">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-200/70" />
          <p><strong className="font-semibold text-amber-100/80">Simulação isolada.</strong> Não informe nome completo, telefone, documentos ou dados de saúde.</p>
        </div>

        {simulationCampaign && (
          <div className="flex items-center justify-center gap-2 border-b border-fuchsia-300/10 bg-fuchsia-400/[0.035] px-4 py-2 text-[10px] text-fuchsia-100/65 sm:px-6 sm:text-xs">
            <Megaphone className="h-3.5 w-3.5 shrink-0 text-fuchsia-300/80" />
            <span className="truncate"><strong className="font-semibold text-fuchsia-100/85">Lead simulado:</strong> campanha {simulationCampaign.name}</span>
          </div>
        )}

        {(error || limitReached || feedbackNotice) && (
          <div className={`mx-4 mt-3 rounded-xl border px-3 py-2 text-sm sm:mx-6 ${limitReached ? "border-amber-300/20 bg-amber-300/10 text-amber-100" : error ? "border-red-400/20 bg-red-400/10 text-red-200" : "border-emerald-400/20 bg-emerald-400/10 text-emerald-100"}`}>
            {limitReached ? "O limite de respostas desta sessão foi atingido." : error || feedbackNotice}
          </div>
        )}

        <div ref={viewportRef} className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6 sm:py-7">
          {messages.length === 0 ? (
            <div className="mx-auto flex h-full min-h-[22rem] w-full max-w-lg flex-col items-center justify-center py-4 text-center">
              <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl border border-fuchsia-300/10 bg-gradient-to-br from-violet-500/20 to-fuchsia-400/10 text-fuchsia-300 shadow-lg shadow-fuchsia-950/20">
                <Sparkles className="h-6 w-6" />
                <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-fuchsia-400 shadow-[0_0_12px_rgba(232,121,249,0.8)]" />
              </div>
              <p className="mt-4 text-[10px] font-bold uppercase tracking-[0.2em] text-fuchsia-300/70">Converse com a assistente</p>
              <h2 className="mt-2 text-xl font-bold tracking-tight sm:text-2xl">O que você gostaria de saber?</h2>
              <p className="mt-2 max-w-sm text-[13px] leading-relaxed text-white/45 sm:text-sm">Faça uma pergunta como cliente e avalie a clareza, o cuidado e a naturalidade da resposta.</p>

              <div className="mt-5 grid w-full gap-2 sm:grid-cols-3">
                {STARTER_QUESTIONS.map((question) => (
                  <button
                    key={question}
                    type="button"
                    onClick={() => setDraft(question)}
                    disabled={inputDisabled}
                    className="group flex min-h-12 items-center gap-2.5 rounded-xl border border-white/[0.08] bg-white/[0.035] px-3 py-2.5 text-left text-[11px] leading-snug text-white/60 transition-colors hover:border-fuchsia-400/25 hover:bg-fuchsia-400/[0.07] hover:text-white/80 disabled:cursor-not-allowed disabled:opacity-40 sm:min-h-[4.5rem] sm:flex-col sm:items-start sm:justify-between"
                  >
                    <MessageCircle className="h-3.5 w-3.5 shrink-0 text-fuchsia-300/70" />
                    <span>{question}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : messages.map((message) => {
            const client = message.role === "client";
            const replyContext = client ? [] : replyContextForMessage(messages, message);
            const paragraphs = client ? [] : assistantParagraphs(message.content);
            return (
              <div key={message.id} className={`flex gap-2.5 ${client ? "justify-end" : "justify-start"}`}>
                {!client && <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-fuchsia-400/10 text-fuchsia-300"><Bot className="h-4 w-4" /></div>}
                <div className={`flex max-w-[88%] flex-col sm:max-w-[74%] ${client ? "items-end" : "items-start"}`}>
                  <div className="mb-1 flex items-center gap-1.5 px-1 text-[10px] font-bold uppercase tracking-wide text-white/35">
                    {client ? <><UserRound className="h-3 w-3" />Você</> : <><Bot className="h-3 w-3" />IA Virtuosa</>}
                    {!client && message.revisionOfMessageId && <span className="ml-1 rounded-full bg-fuchsia-400/10 px-2 py-0.5 text-[9px] normal-case tracking-normal text-fuchsia-200/80">{message.revisionMode === "exact" ? "Resposta definida" : "Resposta refeita"}</span>}
                  </div>
                  <div className={`rounded-2xl px-4 py-3 text-[13px] leading-[1.6] sm:text-sm ${client ? "whitespace-pre-wrap rounded-br-md bg-gradient-to-br from-violet-500 to-fuchsia-600 text-white" : "rounded-bl-md border border-white/10 bg-white/[0.055] text-white/85"}`}>
                    {!client && replyContext.length > 0 && (
                      <div className="mb-3 space-y-1.5">
                        {replyContext.map((referencedMessage) => (
                          <div key={referencedMessage.id} className="rounded-xl border-l-2 border-fuchsia-300/70 bg-black/20 px-3 py-2">
                            <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-fuchsia-200/75 sm:text-[10px]">Respondendo</p>
                            <p className="mt-1 line-clamp-2 break-words text-[11px] leading-relaxed text-white/45 sm:text-xs">
                              {compactMessagePreview(referencedMessage.content)}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                    {client ? message.content : (
                      <div className="space-y-3">
                        {paragraphs.map((paragraph, index) => <p key={`${message.id}-paragraph-${index}`}>{paragraph}</p>)}
                        {message.media?.type === "image" && (
                          <a
                            href={message.media.url}
                            target="_blank"
                            rel="noreferrer"
                            className="block overflow-hidden rounded-xl border border-white/10 bg-black/20 transition-colors hover:border-fuchsia-300/25"
                            aria-label={`Abrir ${message.media.title}`}
                          >
                            <img
                              src={message.media.url}
                              alt={message.media.alt}
                              loading="lazy"
                              className="max-h-[28rem] w-full bg-black/20 object-contain"
                            />
                            <div className="space-y-1.5 border-t border-white/10 px-3 py-2.5">
                              <p className="text-[11px] font-bold text-white/80 sm:text-xs">{message.media.title}</p>
                              <p className="text-[10px] leading-relaxed text-white/45 sm:text-[11px]">{message.media.caption}</p>
                            </div>
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                  {!client && !message.id.startsWith("pending-") && (
                    <div className="mt-2 w-full px-1">
                      <div className="flex items-center gap-1.5 text-[11px] text-white/35">
                        <span>A resposta ajudou?</span>
                        <button type="button" onClick={() => void saveFeedback(message.id, "helpful")} disabled={!!revisingMessageId} className={`flex h-8 w-8 items-center justify-center rounded-lg border transition-colors disabled:opacity-40 ${message.feedbackRating === "helpful" ? "border-emerald-400/30 bg-emerald-400/15 text-emerald-300" : "border-white/10 hover:bg-white/10"}`} aria-label="Resposta ajudou"><ThumbsUp className="h-3.5 w-3.5" /></button>
                        <button type="button" onClick={() => { setFeedbackMessageId(message.id); setFeedbackComment(""); setFeedbackNotice(null); }} disabled={!!revisingMessageId} className={`flex h-8 w-8 items-center justify-center rounded-lg border transition-colors disabled:opacity-40 ${message.feedbackRating === "not_helpful" ? "border-red-400/30 bg-red-400/15 text-red-300" : "border-white/10 hover:bg-white/10"}`} aria-label="Resposta não ajudou"><ThumbsDown className="h-3.5 w-3.5" /></button>
                        <button type="button" onClick={() => void regenerateResponse(message.id)} disabled={!!revisingMessageId || limitReached} className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40" aria-label="Gerar nova resposta" title="Gerar nova resposta com as atualizações mais recentes">
                          {revisingMessageId === message.id && revisingMode === "regenerate" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                        </button>
                        {message.feedbackRating && <Check className="ml-1 h-3.5 w-3.5 text-emerald-400" />}
                      </div>
                      {feedbackMessageId === message.id && (
                        <div className="mt-2 grid gap-2 rounded-xl border border-fuchsia-300/15 bg-black/25 p-3">
                          <label className="text-[11px] font-semibold text-white/65" htmlFor={`feedback-${message.id}`}>Como essa resposta deveria ficar?</label>
                          <textarea id={`feedback-${message.id}`} value={feedbackComment} onChange={(event) => setFeedbackComment(event.target.value.slice(0, 1000))} maxLength={1000} rows={3} autoFocus placeholder="Ex.: mais curta, em parágrafos e terminando com uma pergunta sobre a necessidade do cliente." className="min-h-20 w-full resize-y rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-xs leading-relaxed text-white outline-none placeholder:text-white/30 focus:border-fuchsia-400/50" />
                          <p className="text-[10px] leading-relaxed text-white/35">Como sugestão, a IA reformula a resposta. Como texto exato, o conteúdo aparece abaixo sem reescrita, depois da validação de segurança. Nos dois casos, ele só vira referência para outros testes após aprovação no treinamento.</p>
                          <div className="grid gap-2 sm:grid-cols-[auto_1fr_1fr]">
                            <button type="button" onClick={() => { setFeedbackMessageId(null); setFeedbackComment(""); }} disabled={revisingMessageId === message.id} className="min-h-11 rounded-lg border border-white/10 px-3 text-xs font-bold text-white/55 hover:bg-white/5 disabled:opacity-40">Cancelar</button>
                            <button type="button" onClick={() => void reviseResponse(message.id, "suggestion")} disabled={feedbackComment.trim().length < 5 || revisingMessageId === message.id || limitReached} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-fuchsia-300/20 bg-fuchsia-400/[0.08] px-3 text-xs font-bold text-fuchsia-100 transition-colors hover:bg-fuchsia-400/[0.14] disabled:cursor-not-allowed disabled:opacity-40">
                              {revisingMessageId === message.id && revisingMode === "suggestion" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                              {revisingMessageId === message.id && revisingMode === "suggestion" ? "Reformulando…" : "Usar como sugestão"}
                            </button>
                            <button type="button" onClick={() => void reviseResponse(message.id, "exact")} disabled={feedbackComment.trim().length < 5 || revisingMessageId === message.id || limitReached} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-violet-500 to-fuchsia-600 px-3 text-xs font-bold text-white shadow-lg shadow-fuchsia-950/20 disabled:cursor-not-allowed disabled:opacity-40">
                              {revisingMessageId === message.id && revisingMode === "exact" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                              {revisingMessageId === message.id && revisingMode === "exact" ? "Definindo…" : "Usar exatamente este texto"}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {pendingMessages.length > 0 && !sending && (
            <div className="flex items-center gap-2.5 text-xs text-white/45 sm:text-sm">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-fuchsia-400/10 text-fuchsia-300"><Bot className="h-4 w-4" /></div>
              {pendingRetryPaused ? (
                <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
                  <span>As mensagens continuam salvas.</span>
                  <button
                    type="button"
                    onClick={() => {
                      const retryCreatedAt = new Date().toISOString();
                      setPendingMessages((current) => current.map((message) => ({ ...message, createdAt: retryCreatedAt })));
                      setPendingRetryPaused(false);
                      setError(null);
                    }}
                    className="min-h-9 shrink-0 rounded-lg border border-fuchsia-300/20 bg-fuchsia-400/10 px-3 text-[11px] font-semibold text-fuchsia-100 hover:bg-fuchsia-400/15"
                  >
                    Tentar novamente
                  </button>
                </div>
              ) : (
                <span className="flex items-center gap-2">
                  <span className="flex gap-1" aria-hidden="true"><i className="h-1.5 w-1.5 animate-pulse rounded-full bg-fuchsia-300/70" /><i className="h-1.5 w-1.5 animate-pulse rounded-full bg-fuchsia-300/70 [animation-delay:150ms]" /><i className="h-1.5 w-1.5 animate-pulse rounded-full bg-fuchsia-300/70 [animation-delay:300ms]" /></span>
                  A IA está lendo {pendingMessages.length === 1 ? "sua mensagem" : `suas ${pendingMessages.length} mensagens`}… Você pode complementar.
                </span>
              )}
            </div>
          )}

          {sending && (
            <div className="flex items-center gap-2.5 text-sm text-white/45">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-fuchsia-400/10 text-fuchsia-300"><Bot className="h-4 w-4" /></div>
              <Loader2 className="h-4 w-4 animate-spin" />A IA está digitando…
            </div>
          )}
        </div>

        <form onSubmit={sendMessage} className="border-t border-white/[0.08] bg-[#090e18]/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-xl sm:p-4">
          <div className="mx-auto max-w-3xl">
            <div className="flex items-end gap-2 rounded-2xl border border-white/10 bg-white/[0.05] p-1.5 shadow-[0_12px_40px_rgba(0,0,0,0.18)] transition-colors focus-within:border-fuchsia-400/40 focus-within:bg-white/[0.065]">
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value.slice(0, 1600))}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
                rows={1}
                disabled={inputDisabled}
                placeholder={!sessionReady ? "Teste indisponível" : limitReached ? "Limite da sessão atingido" : pendingBatchFull ? "Aguarde a IA responder este bloco" : "Escreva como se fosse um cliente…"}
                className="min-h-11 max-h-32 flex-1 resize-none bg-transparent px-2.5 py-3 text-[13px] text-white outline-none placeholder:text-white/30 disabled:cursor-not-allowed sm:text-sm"
              />
              <button type="submit" disabled={inputDisabled || !draft.trim()} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-600 text-white shadow-lg shadow-fuchsia-600/15 transition-transform active:scale-95 disabled:cursor-not-allowed disabled:opacity-35" aria-label="Enviar mensagem">
                <Send className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-2 text-center text-[9px] leading-relaxed text-white/25 sm:text-[10px]">
              {pendingMessages.length > 0
                ? "A resposta começa 10 segundos após sua última mensagem. Você ainda pode enviar complementos."
                : "As conversas são registradas apenas para avaliação. Nenhuma ação é executada no sistema."}
            </p>
          </div>
        </form>

        {confirmingReset && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4" role="presentation" onMouseDown={() => !resetting && setConfirmingReset(false)}>
            <section
              role="dialog"
              aria-modal="true"
              aria-labelledby="reset-conversation-title"
              className="w-full max-w-md rounded-t-3xl border border-white/10 bg-[#111725] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl sm:rounded-3xl sm:p-6"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-fuchsia-400/10 text-fuchsia-300">
                  <RotateCcw className="h-5 w-5" />
                </div>
                <button type="button" onClick={() => setConfirmingReset(false)} disabled={resetting} className="flex h-10 w-10 items-center justify-center rounded-xl text-white/45 hover:bg-white/10 hover:text-white disabled:opacity-40" aria-label="Fechar confirmação">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <h2 id="reset-conversation-title" className="mt-4 text-lg font-bold">Reiniciar esta conversa?</h2>
              <p className="mt-2 text-sm leading-relaxed text-white/55">As mensagens e a memória desta sessão serão apagadas. O teste voltará ao início.</p>
              <div className="mt-6 grid grid-cols-2 gap-3">
                <button type="button" onClick={() => setConfirmingReset(false)} disabled={resetting} className="min-h-12 rounded-xl border border-white/10 bg-white/[0.04] px-4 text-sm font-semibold text-white/70 hover:bg-white/[0.08] disabled:opacity-40">Cancelar</button>
                <button type="button" onClick={() => void resetConversation()} disabled={resetting} className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-600 px-4 text-sm font-bold text-white shadow-lg shadow-fuchsia-950/25 disabled:opacity-50">
                  {resetting && <Loader2 className="h-4 w-4 animate-spin" />}
                  {resetting ? "Reiniciando" : "Reiniciar"}
                </button>
              </div>
            </section>
          </div>
        )}

        {confirmingSimulation && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4" role="presentation" onMouseDown={() => !simulating && setConfirmingSimulation(false)}>
            <section
              role="dialog"
              aria-modal="true"
              aria-labelledby="simulate-lead-title"
              className="w-full max-w-md rounded-t-3xl border border-white/10 bg-[#111725] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl sm:rounded-3xl sm:p-6"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-fuchsia-400/10 text-fuchsia-300">
                  {selectedSimulationCampaignId ? <Megaphone className="h-5 w-5" /> : <Dices className="h-5 w-5" />}
                </div>
                <button type="button" onClick={() => setConfirmingSimulation(false)} disabled={simulating} className="flex h-10 w-10 items-center justify-center rounded-xl text-white/45 hover:bg-white/10 hover:text-white disabled:opacity-40" aria-label="Fechar confirmação">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <h2 id="simulate-lead-title" className="mt-4 text-lg font-bold">Simular uma chegada</h2>
              <p className="mt-2 text-sm leading-relaxed text-white/55">Escolha a campanha que trouxe o lead ou mantenha a opção aleatória. Ao iniciar, a conversa atual será apagada.</p>
              <label className="mt-5 block text-xs font-semibold text-white/70" htmlFor="simulation-campaign">Campanha do lead</label>
              <div className="relative mt-2">
                <select
                  id="simulation-campaign"
                  value={selectedSimulationCampaignId}
                  onChange={(event) => setSelectedSimulationCampaignId(event.target.value)}
                  disabled={simulating}
                  className="min-h-12 w-full appearance-none rounded-xl border border-white/10 bg-white/[0.055] px-3 pr-10 text-sm text-white outline-none transition-colors focus:border-fuchsia-400/45 disabled:opacity-50"
                >
                  <option value="" className="bg-[#111725]">Sortear uma campanha</option>
                  {simulationCampaignOptions.map((campaign) => (
                    <option key={campaign.id} value={campaign.id} className="bg-[#111725]">
                      {campaign.name}{campaign.label && campaign.label !== campaign.name ? ` · ${campaign.label}` : ""}
                    </option>
                  ))}
                </select>
                <Dices className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fuchsia-200/60" />
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-white/35">
                {selectedSimulationCampaignId
                  ? "A IA iniciará o teste com o contexto da campanha selecionada."
                  : "O sistema escolherá uma campanha aprovada e vigente desta unidade."}
              </p>
              <div className="mt-6 grid grid-cols-2 gap-3">
                <button type="button" onClick={() => setConfirmingSimulation(false)} disabled={simulating} className="min-h-12 rounded-xl border border-white/10 bg-white/[0.04] px-4 text-sm font-semibold text-white/70 hover:bg-white/[0.08] disabled:opacity-40">Cancelar</button>
                <button type="button" onClick={() => void simulateLeadArrival()} disabled={simulating} className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-600 px-4 text-sm font-bold text-white shadow-lg shadow-fuchsia-950/25 disabled:opacity-50">
                  {simulating && <Loader2 className="h-4 w-4 animate-spin" />}
                  {simulating ? "Iniciando" : "Iniciar teste"}
                </button>
              </div>
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
