"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { Bot, Check, Loader2, LockKeyhole, Send, ShieldCheck, ThumbsDown, ThumbsUp, UserRound } from "lucide-react";

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
  createdAt: string;
};

type Limits = { repliesUsed: number; repliesAllowed: number };

async function responseData(response: Response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Não foi possível concluir a ação.");
  return data;
}

export default function PublicAiTestPage() {
  const { token: routeToken } = useParams<{ token: string }>();
  const [token, setToken] = useState("");
  const [test, setTest] = useState<PublicTest | null>(null);
  const [messages, setMessages] = useState<PublicMessage[]>([]);
  const [limits, setLimits] = useState<Limits>({ repliesUsed: 0, repliesAllowed: 20 });
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedbackMessageId, setFeedbackMessageId] = useState<string | null>(null);
  const [feedbackComment, setFeedbackComment] = useState("");
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
  }, [messages.length, sending]);

  async function sendMessage(event: FormEvent) {
    event.preventDefault();
    const content = draft.trim();
    if (!content || sending || !sessionReady || limits.repliesUsed >= limits.repliesAllowed) return;
    const clientMessageId = crypto.randomUUID();
    const optimisticId = `pending-${clientMessageId}`;
    setDraft("");
    setSending(true);
    setError(null);
    setMessages((current) => [...current, {
      id: optimisticId,
      role: "client",
      content,
      createdAt: new Date().toISOString(),
    }]);
    try {
      const data = await responseData(await fetch("/api/public/ai-test/acesso/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ content, clientMessageId }),
      }));
      setMessages(data.messages || []);
      if (data.limits) setLimits(data.limits);
    } catch (err: unknown) {
      setMessages((current) => current.filter((message) => message.id !== optimisticId));
      setDraft(content);
      setError(err instanceof Error ? err.message : "A IA não conseguiu responder.");
    } finally {
      setSending(false);
    }
  }

  async function saveFeedback(messageId: string, rating: "helpful" | "not_helpful", comment = "") {
    try {
      await responseData(await fetch("/api/public/ai-test/acesso/messages", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ messageId, rating, comment }),
      }));
      setMessages((current) => current.map((message) => message.id === messageId
        ? { ...message, feedbackRating: rating, feedbackComment: comment || null }
        : message));
      setFeedbackMessageId(null);
      setFeedbackComment("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar a avaliação.");
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-[#070b14] p-4 text-white">
        <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-sm text-white/70">
          <Loader2 className="h-5 w-5 animate-spin text-fuchsia-400" />Preparando o ambiente de teste
        </div>
      </main>
    );
  }

  if (error && !test) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-[#070b14] p-4 text-white">
        <section className="w-full max-w-md rounded-3xl border border-red-400/20 bg-white/[0.045] p-6 text-center shadow-2xl">
          <LockKeyhole className="mx-auto h-10 w-10 text-red-300" />
          <h1 className="mt-4 text-xl font-bold">Teste indisponível</h1>
          <p className="mt-2 text-sm leading-relaxed text-white/60">{error}</p>
        </section>
      </main>
    );
  }

  const limitReached = limits.repliesUsed >= limits.repliesAllowed;
  const inputDisabled = sending || !sessionReady || limitReached;

  return (
    <main className="min-h-dvh bg-[radial-gradient(circle_at_top,_rgba(168,85,247,0.18),_transparent_34%),#070b14] p-0 text-white sm:p-4 lg:p-6">
      <div className="mx-auto flex h-dvh w-full max-w-5xl flex-col overflow-hidden border-white/10 bg-[#0d1320]/95 shadow-2xl sm:h-[calc(100dvh-2rem)] sm:rounded-3xl sm:border lg:h-[calc(100dvh-3rem)]">
        <header className="border-b border-white/10 px-4 py-4 sm:px-6">
          <div className="flex items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 shadow-lg shadow-fuchsia-500/20">
                <Bot className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-base font-extrabold sm:text-lg">{test?.title}</h1>
                <div className="mt-0.5 flex items-center gap-1.5 text-xs text-white/50">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />Ambiente público isolado · {test?.unit}
                </div>
              </div>
            </div>
            <div className="shrink-0 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/60">
              {limits.repliesUsed}/{limits.repliesAllowed}
            </div>
          </div>
        </header>

        <div className="border-b border-amber-300/10 bg-amber-300/[0.055] px-4 py-2.5 text-center text-[11px] leading-relaxed text-amber-100/70 sm:px-6 sm:text-xs">
          Simulação sem acesso ao CRM ou WhatsApp. Não informe nome completo, telefone, documentos ou dados de saúde.
        </div>

        {(error || limitReached) && (
          <div className={`mx-4 mt-3 rounded-xl border px-3 py-2 text-sm sm:mx-6 ${limitReached ? "border-amber-300/20 bg-amber-300/10 text-amber-100" : "border-red-400/20 bg-red-400/10 text-red-200"}`}>
            {limitReached ? "O limite de respostas desta sessão foi atingido." : error}
          </div>
        )}

        <div ref={viewportRef} className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6 sm:py-7">
          {messages.length === 0 ? (
            <div className="flex h-full min-h-72 flex-col items-center justify-center text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-fuchsia-400/10 text-fuchsia-300"><Bot className="h-8 w-8" /></div>
              <h2 className="mt-5 text-xl font-bold">Faça uma pergunta como cliente</h2>
              <p className="mt-2 max-w-md text-sm leading-relaxed text-white/50">Pergunte sobre um procedimento, objetivo estético ou dúvida comum. Este chat existe apenas para avaliar o comportamento da assistente.</p>
            </div>
          ) : messages.map((message) => {
            const client = message.role === "client";
            return (
              <div key={message.id} className={`flex gap-2.5 ${client ? "justify-end" : "justify-start"}`}>
                {!client && <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-fuchsia-400/10 text-fuchsia-300"><Bot className="h-4 w-4" /></div>}
                <div className={`flex max-w-[88%] flex-col sm:max-w-[74%] ${client ? "items-end" : "items-start"}`}>
                  <div className="mb-1 flex items-center gap-1.5 px-1 text-[10px] font-bold uppercase tracking-wide text-white/35">
                    {client ? <><UserRound className="h-3 w-3" />Você</> : <><Bot className="h-3 w-3" />IA Virtuosa</>}
                  </div>
                  <div className={`whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-relaxed ${client ? "rounded-br-md bg-gradient-to-br from-violet-500 to-fuchsia-600 text-white" : "rounded-bl-md border border-white/10 bg-white/[0.055] text-white/85"}`}>
                    {message.content}
                  </div>
                  {!client && !message.id.startsWith("pending-") && (
                    <div className="mt-2 w-full px-1">
                      <div className="flex items-center gap-1.5 text-[11px] text-white/35">
                        <span>A resposta ajudou?</span>
                        <button type="button" onClick={() => void saveFeedback(message.id, "helpful")} className={`flex h-8 w-8 items-center justify-center rounded-lg border transition-colors ${message.feedbackRating === "helpful" ? "border-emerald-400/30 bg-emerald-400/15 text-emerald-300" : "border-white/10 hover:bg-white/10"}`} aria-label="Resposta ajudou"><ThumbsUp className="h-3.5 w-3.5" /></button>
                        <button type="button" onClick={() => setFeedbackMessageId(message.id)} className={`flex h-8 w-8 items-center justify-center rounded-lg border transition-colors ${message.feedbackRating === "not_helpful" ? "border-red-400/30 bg-red-400/15 text-red-300" : "border-white/10 hover:bg-white/10"}`} aria-label="Resposta não ajudou"><ThumbsDown className="h-3.5 w-3.5" /></button>
                        {message.feedbackRating && <Check className="ml-1 h-3.5 w-3.5 text-emerald-400" />}
                      </div>
                      {feedbackMessageId === message.id && (
                        <div className="mt-2 flex flex-col gap-2 rounded-xl border border-white/10 bg-black/20 p-2 sm:flex-row">
                          <input value={feedbackComment} onChange={(event) => setFeedbackComment(event.target.value)} maxLength={500} placeholder="O que poderia melhorar? (opcional)" className="h-10 min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-3 text-xs text-white outline-none placeholder:text-white/30 focus:border-fuchsia-400/50" />
                          <button type="button" onClick={() => void saveFeedback(message.id, "not_helpful", feedbackComment)} className="h-10 rounded-lg bg-white/10 px-3 text-xs font-bold hover:bg-white/15">Enviar avaliação</button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {sending && (
            <div className="flex items-center gap-2.5 text-sm text-white/45">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-fuchsia-400/10 text-fuchsia-300"><Bot className="h-4 w-4" /></div>
              <Loader2 className="h-4 w-4 animate-spin" />A IA está preparando a resposta…
            </div>
          )}
        </div>

        <form onSubmit={sendMessage} className="border-t border-white/10 bg-[#0b101b] p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:p-4">
          <div className="flex items-end gap-2 rounded-2xl border border-white/10 bg-white/[0.045] p-2 focus-within:border-fuchsia-400/50">
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
              placeholder={!sessionReady ? "Teste indisponível" : limitReached ? "Limite da sessão atingido" : "Escreva como se fosse um cliente…"}
              className="min-h-12 max-h-32 flex-1 resize-none bg-transparent px-2 py-3 text-sm text-white outline-none placeholder:text-white/30 disabled:cursor-not-allowed"
            />
            <button type="submit" disabled={inputDisabled || !draft.trim()} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-600 text-white shadow-lg shadow-fuchsia-600/15 disabled:cursor-not-allowed disabled:opacity-40" aria-label="Enviar mensagem">
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </div>
          <p className="mt-2 text-center text-[10px] text-white/30">As conversas são registradas para avaliação da qualidade. Nenhuma ação é executada no sistema.</p>
        </form>
      </div>
    </main>
  );
}
