"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Loader2, RefreshCw, Send } from "lucide-react";

type HandoffMessage = {
  id: string;
  body: string;
  type: string;
  fromMe: boolean;
  timestamp: string;
  mediaUrl: string | null;
  mediaMimeType: string | null;
  mediaFileName: string | null;
};
type HandoffConversation = { id: string; contactName: string; status: string; canReply: boolean };

export default function AliceHandoffPage() {
  const params = useParams<{ id: string }>();
  const conversationId = params.id;
  const [conversation, setConversation] = useState<HandoffConversation | null>(null);
  const [messages, setMessages] = useState<HandoffMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    if (!conversationId) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/crm/alice-handoff/${encodeURIComponent(conversationId)}`, { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Não foi possível carregar a conversa.");
      setConversation(data.conversation);
      setMessages(data.messages || []);
      setError("");
    } catch (cause) {
      setConversation(null);
      setMessages([]);
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar a conversa.");
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  useEffect(() => { void refresh(); }, [refresh]);

  async function send() {
    const text = draft.trim();
    if (!text || !conversation?.canReply || sending) return;
    setSending(true);
    try {
      const response = await fetch("/api/whatsapp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, type: "text", body: text, delegatedHandoff: true, claimConversation: true }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Não foi possível enviar a mensagem.");
      setDraft("");
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível enviar a mensagem.");
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-4xl flex-col bg-[#0c1017] px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 text-white sm:px-6">
      <header className="flex items-start justify-between gap-3 border-b border-white/10 pb-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-violet-300">Atendimento encaminhado pela Alice · SBC</p>
          <h1 className="mt-1 truncate text-xl font-semibold">{conversation?.contactName || "Conversa encaminhada"}</h1>
          <p className="mt-1 text-sm text-slate-400">Somente esta conversa está disponível para você.</p>
        </div>
        <button type="button" onClick={() => void refresh()} disabled={loading} aria-label="Atualizar conversa"
          className="flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-white/15 text-slate-200 disabled:opacity-50">
          <RefreshCw className="h-5 w-5" />
        </button>
      </header>
      {error && <p role="alert" className="my-3 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</p>}
      <section aria-label="Mensagens da conversa" className="flex min-h-[45dvh] flex-1 flex-col gap-3 overflow-y-auto py-5">
        {loading && <div className="flex items-center gap-2 text-sm text-slate-400"><Loader2 className="h-4 w-4 animate-spin" /> Carregando conversa…</div>}
        {!loading && messages.length === 0 && !error && <p className="text-sm text-slate-400">Nenhuma mensagem disponível.</p>}
        {messages.map((message) => (
          <article key={message.id} className={`max-w-[90%] rounded-2xl px-4 py-3 text-sm leading-relaxed sm:max-w-[75%] ${message.fromMe ? "self-end bg-emerald-900/70" : "self-start bg-slate-800"}`}>
            {message.body && <p className="whitespace-pre-wrap break-words">{message.body}</p>}
            {message.mediaUrl && <a href={message.mediaUrl} target="_blank" rel="noreferrer" className="mt-2 block break-all text-sky-300 underline">Abrir {message.mediaFileName || (message.type === "audio" ? "áudio" : "anexo")}</a>}
            {!message.body && !message.mediaUrl && <p className="text-slate-300">{message.type === "audio" ? "Áudio indisponível" : "Anexo indisponível"}</p>}
            <time className="mt-2 block text-right text-xs text-slate-400" dateTime={message.timestamp}>{new Date(message.timestamp).toLocaleString("pt-BR", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })}</time>
          </article>
        ))}
      </section>
      <div className="sticky bottom-0 border-t border-white/10 bg-[#0c1017] pt-3">
        {conversation && !conversation.canReply && <p className="mb-2 text-sm text-amber-200">Esta conversa está fechada, bloqueada ou a instância está desconectada.</p>}
        <div className="flex items-end gap-2">
          <label htmlFor="alice-handoff-reply" className="sr-only">Resposta para o cliente</label>
          <textarea id="alice-handoff-reply" value={draft} onChange={(event) => setDraft(event.target.value)} rows={2}
            disabled={!conversation?.canReply || sending} placeholder="Escreva uma resposta revisada por você…"
            className="min-h-14 min-w-0 flex-1 resize-y rounded-xl border border-white/15 bg-slate-900 px-3 py-3 text-base text-white outline-none focus:border-violet-400 disabled:opacity-50" />
          <button type="button" onClick={() => void send()} disabled={!draft.trim() || !conversation?.canReply || sending}
            aria-label="Enviar resposta" className="flex min-h-14 min-w-14 items-center justify-center rounded-xl bg-violet-600 text-white disabled:opacity-50">
            {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-400">O envio só acontece quando você toca em Enviar. A Alice não envia mensagens automaticamente.</p>
      </div>
    </main>
  );
}
