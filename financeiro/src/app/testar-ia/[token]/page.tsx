"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { Bot, Check, Loader2, LockKeyhole, MessageCircle, Send, ShieldCheck, Sparkles, ThumbsDown, ThumbsUp, UserRound } from "lucide-react";

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

const STARTER_QUESTIONS = [
  "Quero melhorar a flacidez. O que você recomenda?",
  "Como funciona a criolipólise?",
  "Qual tratamento pode ajudar nas manchas?",
];

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
      <main className="public-ai-test-page flex min-h-dvh items-center justify-center bg-[#070b14] p-4 text-white">
        <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-sm text-white/70">
          <Loader2 className="h-5 w-5 animate-spin text-fuchsia-400" />Preparando o ambiente de teste
        </div>
      </main>
    );
  }

  if (error && !test) {
    return (
      <main className="public-ai-test-page flex min-h-dvh items-center justify-center bg-[#070b14] p-4 text-white">
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
    <main className="public-ai-test-page min-h-dvh bg-[radial-gradient(circle_at_50%_-10%,_rgba(217,70,239,0.2),_transparent_34%),radial-gradient(circle_at_100%_100%,_rgba(124,58,237,0.12),_transparent_32%),#060913] p-0 text-white sm:p-4 lg:p-6">
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
            <div className="shrink-0 rounded-full border border-white/10 bg-white/[0.045] px-3 py-1.5 text-[11px] font-semibold tabular-nums text-white/55 sm:text-xs">
              {limits.repliesUsed} de {limits.repliesAllowed}
            </div>
          </div>
        </header>

        <div className="flex items-start justify-center gap-2 border-b border-amber-300/10 bg-amber-300/[0.045] px-4 py-2.5 text-[10px] leading-relaxed text-amber-100/65 sm:px-6 sm:text-xs">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-200/70" />
          <p><strong className="font-semibold text-amber-100/80">Simulação isolada.</strong> Não informe nome completo, telefone, documentos ou dados de saúde.</p>
        </div>

        {(error || limitReached) && (
          <div className={`mx-4 mt-3 rounded-xl border px-3 py-2 text-sm sm:mx-6 ${limitReached ? "border-amber-300/20 bg-amber-300/10 text-amber-100" : "border-red-400/20 bg-red-400/10 text-red-200"}`}>
            {limitReached ? "O limite de respostas desta sessão foi atingido." : error}
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
                placeholder={!sessionReady ? "Teste indisponível" : limitReached ? "Limite da sessão atingido" : "Escreva como se fosse um cliente…"}
                className="min-h-11 max-h-32 flex-1 resize-none bg-transparent px-2.5 py-3 text-[13px] text-white outline-none placeholder:text-white/30 disabled:cursor-not-allowed sm:text-sm"
              />
              <button type="submit" disabled={inputDisabled || !draft.trim()} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-600 text-white shadow-lg shadow-fuchsia-600/15 transition-transform active:scale-95 disabled:cursor-not-allowed disabled:opacity-35" aria-label="Enviar mensagem">
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            </div>
            <p className="mt-2 text-center text-[9px] leading-relaxed text-white/25 sm:text-[10px]">As conversas são registradas apenas para avaliação. Nenhuma ação é executada no sistema.</p>
          </div>
        </form>
      </div>
    </main>
  );
}
