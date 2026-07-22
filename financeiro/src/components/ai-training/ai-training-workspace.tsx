"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  BookOpen,
  Check,
  Database,
  Edit3,
  Loader2,
  MessageCircle,
  Plus,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  UserRound,
  X,
} from "lucide-react";

type ConversationSummary = {
  id: string;
  unit: string;
  title?: string | null;
  createdByName?: string | null;
  updatedAt: string;
  _count: { messages: number };
  messages: Array<{ content: string; role: string; createdAt: string }>;
};

type TrainingMessage = {
  id: string;
  role: "client" | "assistant";
  content: string;
  originalContent?: string | null;
  model?: string | null;
  guardrailFlags?: string[] | null;
  editedByName?: string | null;
  editedAt?: string | null;
  createdAt: string;
};

type TrainingConversation = {
  id: string;
  unit: string;
  title?: string | null;
  createdByName?: string | null;
  replyDueAt?: string | null;
  replyStatus: "idle" | "pending" | "processing" | "failed";
  replyVersion: number;
  messages: TrainingMessage[];
};

type TrainingMemory = {
  id: string;
  unit: string;
  sourceType: string;
  triggerText: string;
  originalAnswer?: string | null;
  correctedAnswer: string;
  category: string;
  status: string;
  createdByName?: string | null;
  reviewedByName?: string | null;
  reviewedAt?: string | null;
  createdAt: string;
};

type MemoryCount = { status: string; _count: { _all: number } };

function formatDate(value?: string | null) {
  if (!value) return "";
  return new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

async function responseData(response: Response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.details || data.error || "Não foi possível concluir a ação.");
  return data;
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function AiTrainingChat() {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [allowedUnits, setAllowedUnits] = useState<string[]>([]);
  const [selectedUnit, setSelectedUnit] = useState("");
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [conversation, setConversation] = useState<TrainingConversation | null>(null);
  const [draft, setDraft] = useState("");
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingConversation, setLoadingConversation] = useState(false);
  const [creating, setCreating] = useState(false);
  const [sending, setSending] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [cadernoEnabled, setCadernoEnabled] = useState(true);
  const [replyCountdown, setReplyCountdown] = useState<number | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const messagesViewportRef = useRef<HTMLDivElement>(null);
  const generationRequestsRef = useRef(new Set<string>());

  const loadConversations = useCallback(async (preferredId?: string | null) => {
    setLoading(true);
    setError(null);
    try {
      const data = await responseData(await fetch("/api/crm/ai-shadow/training/conversations"));
      const nextConversations: ConversationSummary[] = data.conversations || [];
      const units: string[] = data.allowedUnits || [];
      setConversations(nextConversations);
      setAllowedUnits(units);
      setSelectedUnit((current) => current || units[0] || "");
      const nextId = preferredId && nextConversations.some((item) => item.id === preferredId)
        ? preferredId
        : activeConversationId && nextConversations.some((item) => item.id === activeConversationId)
          ? activeConversationId
          : nextConversations[0]?.id || null;
      setActiveConversationId(nextId);
    } catch (error: unknown) {
      setError(errorMessage(error, "Falha ao carregar chats internos."));
    } finally {
      setLoading(false);
    }
  }, [activeConversationId]);

  const loadConversation = useCallback(async (conversationId: string) => {
    setLoadingConversation(true);
    setError(null);
    try {
      const data = await responseData(await fetch(`/api/crm/ai-shadow/training/conversations/${conversationId}`));
      setConversation(data.conversation || null);
    } catch (error: unknown) {
      setError(errorMessage(error, "Falha ao carregar a conversa."));
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
        body: JSON.stringify({
          conversationId,
          replyVersion,
          retry,
          includeExperimentalCaderno: cadernoEnabled,
        }),
      }));
      if (data.status === "generated") {
        const usedEntries = data.generation?.experimentalCaderno?.entryIds?.length || 0;
        setNotice(cadernoEnabled
          ? `Resposta gerada com o Caderno em teste (${usedEntries} ${usedEntries === 1 ? "ficha recuperada" : "fichas recuperadas"}).`
          : "Resposta gerada somente com a base ativa.");
      }
      await Promise.all([loadConversation(conversationId), loadConversations(conversationId)]);
    } catch (error: unknown) {
      setError(errorMessage(error, "A IA não conseguiu responder."));
      await loadConversation(conversationId);
    } finally {
      generationRequestsRef.current.delete(requestKey);
      setGenerating(generationRequestsRef.current.size > 0);
    }
  }, [cadernoEnabled, loadConversation, loadConversations]);

  useEffect(() => {
    loadConversations();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (activeConversationId) loadConversation(activeConversationId);
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
      const remaining = Math.max(0, Math.ceil((dueAt - Date.now()) / 1000));
      setReplyCountdown(conversation.replyStatus === "pending" ? remaining : null);
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

  async function createConversation() {
    if (!selectedUnit) return null;
    setCreating(true);
    setNotice(null);
    setError(null);
    try {
      const data = await responseData(await fetch("/api/crm/ai-shadow/training/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unit: selectedUnit }),
      }));
      const id = data.conversation.id as string;
      await loadConversations(id);
      setActiveConversationId(id);
      setNotice("Nova simulação criada.");
      return id;
    } catch (error: unknown) {
      setError(errorMessage(error, "Falha ao criar conversa."));
      return null;
    } finally {
      setCreating(false);
    }
  }

  async function sendMessage(event: FormEvent) {
    event.preventDefault();
    const content = draft.trim();
    if (!content || sending) return;
    let conversationId = activeConversationId;
    if (!conversationId) conversationId = await createConversation();
    if (!conversationId) return;

    setSending(true);
    setNotice(null);
    setError(null);
    setDraft("");
    try {
      await responseData(await fetch("/api/crm/ai-shadow/training/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, content }),
      }));
      setNotice("Mensagem registrada. A IA aguardará 20 segundos por um complemento.");
      await Promise.all([loadConversation(conversationId), loadConversations(conversationId)]);
    } catch (error: unknown) {
      setDraft(content);
      setError(errorMessage(error, "Não foi possível registrar a mensagem."));
      await loadConversation(conversationId);
    } finally {
      setSending(false);
    }
  }

  function startEditing(message: TrainingMessage) {
    setEditingMessageId(message.id);
    setEditingContent(message.content);
    setNotice(null);
    setError(null);
  }

  async function saveEdit(messageId: string) {
    if (!editingContent.trim()) return;
    setSavingEdit(true);
    setNotice(null);
    setError(null);
    try {
      await responseData(await fetch("/api/crm/ai-shadow/training/messages", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId, content: editingContent }),
      }));
      setEditingMessageId(null);
      setEditingContent("");
      setNotice("Correção salva e adicionada à memória pendente.");
      if (activeConversationId) await loadConversation(activeConversationId);
    } catch (error: unknown) {
      setError(errorMessage(error, "Falha ao salvar correção."));
    } finally {
      setSavingEdit(false);
    }
  }

  const replyPending = conversation?.replyStatus === "pending";
  const replyProcessing = conversation?.replyStatus === "processing";
  const replyFailed = conversation?.replyStatus === "failed";

  return (
    <div className="grid h-[calc(100dvh-13rem)] min-h-[600px] max-h-[820px] grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-2xl border border-border bg-card lg:grid-cols-[300px_minmax(0,1fr)] lg:grid-rows-1">
      <aside className="flex max-h-64 min-h-0 flex-col overflow-hidden border-b border-border bg-muted/20 lg:h-full lg:max-h-none lg:border-b-0 lg:border-r">
        <div className="border-b border-border p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-bold">Simulações</div>
              <div className="text-xs text-muted-foreground">Você escreve como cliente.</div>
            </div>
            <button
              type="button"
              onClick={createConversation}
              disabled={creating || !selectedUnit}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-3 text-xs font-bold text-primary-foreground disabled:opacity-50"
            >
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Novo chat
            </button>
          </div>
          <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
            Unidade da simulação
            <select
              value={selectedUnit}
              onChange={(event) => setSelectedUnit(event.target.value)}
              className="h-10 rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none focus:border-primary"
            >
              {allowedUnits.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
            </select>
          </label>
        </div>
        <div className="max-h-64 flex-1 overflow-y-auto p-2 lg:max-h-none">
          {loading ? (
            <div className="flex h-28 items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Carregando</div>
          ) : conversations.length === 0 ? (
            <div className="m-2 rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
              Crie a primeira simulação para começar.
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
                  <span className="truncate text-sm font-semibold">{item.title || "Nova simulação"}</span>
                  <span className="rounded-full bg-background px-2 py-0.5 text-[10px] font-bold text-muted-foreground">{item.unit}</span>
                </div>
                <div className="mt-1 truncate text-xs text-muted-foreground">{item.messages[0]?.content || "Sem mensagens"}</div>
                <div className="mt-2 text-[10px] text-muted-foreground/70">{item._count.messages} mensagens · {formatDate(item.updatedAt)}</div>
              </button>
            );
          })}
        </div>
      </aside>

      <section className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
        <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><Bot className="h-5 w-5" /></div>
            <div className="min-w-0">
              <div className="truncate text-sm font-bold">{conversation?.title || "Chat interno com a IA"}</div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><ShieldCheck className="h-3.5 w-3.5" />Nada é enviado ao WhatsApp</div>
            </div>
          </div>
          {activeConversationId && (
            <button type="button" onClick={() => loadConversation(activeConversationId)} className="inline-flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-xs font-semibold text-muted-foreground hover:bg-muted">
              <RefreshCw className="h-3.5 w-3.5" />Atualizar
            </button>
          )}
        </header>

        <div className="flex flex-col gap-2 border-b border-border bg-primary/[0.035] px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <BookOpen className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold text-foreground">Caderno em teste</div>
              <div className="truncate text-[11px] text-muted-foreground">Fonte experimental restrita a esta simulação interna.</div>
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={cadernoEnabled}
            onClick={() => setCadernoEnabled((current) => !current)}
            disabled={generating || replyPending || replyProcessing}
            className={`inline-flex min-h-10 w-full shrink-0 items-center justify-between gap-2 rounded-lg border px-3 text-xs font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto ${cadernoEnabled ? "border-primary/40 bg-primary/10 text-primary" : "border-border bg-background text-muted-foreground"}`}
          >
            <span>{cadernoEnabled ? "Ativo" : "Desativado"}</span>
            <span className={`relative h-5 w-9 rounded-full transition-colors ${cadernoEnabled ? "bg-primary" : "bg-muted"}`}>
              <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${cadernoEnabled ? "translate-x-[18px]" : "translate-x-0.5"}`} />
            </span>
          </button>
        </div>

        {(notice || error) && (
          <div className={`mx-4 mt-3 rounded-lg border px-3 py-2 text-sm ${error ? "border-red-500/30 bg-red-500/10 text-red-300" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"}`}>
            {error || notice}
          </div>
        )}

        <div ref={messagesViewportRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4 sm:p-6">
          {loadingConversation ? (
            <div className="flex h-full min-h-72 items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Carregando conversa</div>
          ) : !conversation || conversation.messages.length === 0 ? (
            <div className="flex min-h-72 flex-col items-center justify-center text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary"><MessageCircle className="h-8 w-8" /></div>
              <h3 className="text-lg font-bold">Simule uma conversa real</h3>
              <p className="mt-2 max-w-md text-sm text-muted-foreground">Escreva como se fosse um cliente perguntando sobre procedimentos. Com o Caderno em teste ativo, as fichas experimentais são usadas apenas aqui. Depois, edite a resposta para ensinar a forma correta de atender.</p>
            </div>
          ) : conversation.messages.map((message) => {
            const isClient = message.role === "client";
            const editing = editingMessageId === message.id;
            return (
              <div key={message.id} className={`flex gap-2 ${isClient ? "justify-end" : "justify-start"}`}>
                {!isClient && <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><Bot className="h-4 w-4" /></div>}
                <div className={`max-w-[86%] sm:max-w-[74%] ${isClient ? "items-end" : "items-start"} flex flex-col`}>
                  <div className="mb-1 flex items-center gap-2 px-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                    {isClient ? <><UserRound className="h-3 w-3" />Cliente simulado</> : <><Sparkles className="h-3 w-3" />IA Virtuosa</>}
                  </div>
                  <div className={`group relative rounded-2xl px-4 py-3 text-sm leading-relaxed ${isClient ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-bl-md border border-border bg-background"}`}>
                    {editing ? (
                      <div className="grid min-w-[280px] gap-2">
                        <textarea
                          value={editingContent}
                          onChange={(event) => setEditingContent(event.target.value)}
                          rows={5}
                          autoFocus
                          className="w-full resize-y rounded-lg border border-input bg-card p-3 text-sm text-foreground outline-none focus:border-primary"
                        />
                        <div className="flex justify-end gap-2">
                          <button type="button" onClick={() => setEditingMessageId(null)} className="inline-flex h-8 items-center gap-1 rounded-md border border-border px-2 text-xs font-semibold"><X className="h-3.5 w-3.5" />Cancelar</button>
                          <button type="button" onClick={() => saveEdit(message.id)} disabled={savingEdit} className="inline-flex h-8 items-center gap-1 rounded-md bg-primary px-2 text-xs font-semibold text-primary-foreground disabled:opacity-50">
                            {savingEdit ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}Salvar e ensinar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="whitespace-pre-wrap">{message.content}</div>
                        {!isClient && (
                          <button type="button" onClick={() => startEditing(message)} title="Corrigir resposta" className="absolute -right-3 -top-3 flex h-8 w-8 items-center justify-center rounded-full border border-border bg-card text-muted-foreground opacity-100 shadow-sm hover:text-primary sm:opacity-0 sm:group-hover:opacity-100">
                            <Edit3 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                  <div className="mt-1 px-1 text-[10px] text-muted-foreground">
                    {formatDate(message.createdAt)}
                    {message.editedAt && ` · corrigida por ${message.editedByName || "usuário"}`}
                  </div>
                  {!isClient && message.guardrailFlags && message.guardrailFlags.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">{message.guardrailFlags.map((flag) => <span key={flag} className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-400">{flag}</span>)}</div>
                  )}
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
                  ? "A IA está analisando a conversa completa…"
                  : `Aguardando ${replyCountdown ?? 20}s para ver se o cliente complementa…`}
            </div>
          )}
          {replyFailed && conversation && (
            <div className="flex items-center gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              <span className="flex-1">A geração falhou. Você pode tentar novamente sem reenviar a mensagem.</span>
              <button
                type="button"
                onClick={() => generateReply(conversation.id, conversation.replyVersion, true)}
                disabled={generating}
                className="rounded-lg border border-red-500/30 px-3 py-1.5 text-xs font-bold hover:bg-red-500/10 disabled:opacity-50"
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
              placeholder="Escreva como se fosse o cliente…"
              className="h-12 min-h-12 max-h-12 flex-1 resize-none overflow-y-auto bg-transparent px-2 py-2 text-sm outline-none placeholder:text-muted-foreground"
            />
            <button type="submit" disabled={sending || !draft.trim() || allowedUnits.length === 0} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground disabled:opacity-50" aria-label="Enviar mensagem">
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </div>
          <p className="mt-2 text-center text-[10px] text-muted-foreground">Enter envia · Shift + Enter quebra a linha · respostas corrigidas aguardam aprovação</p>
        </form>
      </section>
    </div>
  );
}

export function AiTrainingMemory() {
  const [memories, setMemories] = useState<TrainingMemory[]>([]);
  const [counts, setCounts] = useState<MemoryCount[]>([]);
  const [allowedUnits, setAllowedUnits] = useState<string[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [status, setStatus] = useState("pending");
  const [unit, setUnit] = useState("");
  const [loading, setLoading] = useState(true);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [editingMemoryId, setEditingMemoryId] = useState<string | null>(null);
  const [editingMemoryContent, setEditingMemoryContent] = useState("");
  const [bootstrapping, setBootstrapping] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const countByStatus = useMemo(() => Object.fromEntries(counts.map((item) => [item.status, item._count._all])), [counts]);

  const loadMemories = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      if (unit) params.set("unit", unit);
      const data = await responseData(await fetch(`/api/crm/ai-shadow/training/memory?${params}`));
      setMemories(data.memories || []);
      setCounts(data.counts || []);
      setAllowedUnits(data.allowedUnits || []);
      setIsAdmin(data.isAdmin === true);
    } catch (error: unknown) {
      setError(errorMessage(error, "Falha ao carregar memória."));
    } finally {
      setLoading(false);
    }
  }, [status, unit]);

  useEffect(() => {
    loadMemories();
  }, [loadMemories]);

  async function review(id: string, action: "approve" | "reject") {
    setReviewingId(id);
    setNotice(null);
    setError(null);
    try {
      await responseData(await fetch("/api/crm/ai-shadow/training/memory", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      }));
      setNotice(action === "approve" ? "Memória aprovada e disponível para o chat." : "Memória rejeitada.");
      await loadMemories();
    } catch (error: unknown) {
      setError(errorMessage(error, "Falha ao revisar memória."));
    } finally {
      setReviewingId(null);
    }
  }

  async function saveMemoryEdit(id: string) {
    if (!editingMemoryContent.trim()) return;
    setReviewingId(id);
    setNotice(null);
    setError(null);
    try {
      await responseData(await fetch("/api/crm/ai-shadow/training/memory", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: "update", correctedAnswer: editingMemoryContent }),
      }));
      setEditingMemoryId(null);
      setEditingMemoryContent("");
      setNotice("Resposta da memória corrigida. Ela continua pendente até ser aprovada.");
      await loadMemories();
    } catch (error: unknown) {
      setError(errorMessage(error, "Falha ao corrigir memória."));
    } finally {
      setReviewingId(null);
    }
  }

  async function prepareInitialMemory() {
    setBootstrapping(true);
    setNotice(null);
    setError(null);
    try {
      const units = [...new Set(["Todas", ...allowedUnits])];
      const results = [];
      for (const targetUnit of units) {
        const data = await responseData(await fetch("/api/crm/ai-shadow/training/bootstrap", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ unit: targetUnit }),
        }));
        results.push(data);
      }
      const imported = results.reduce((sum, item) => sum + (item.imported || 0), 0);
      const approved = results.reduce((sum, item) => sum + (item.approvedPatterns || 0), 0);
      const pending = results.reduce((sum, item) => sum + (item.pendingReview || 0), 0);
      setNotice(`${imported} memórias importadas: ${approved} padrões seguros aprovados e ${pending} itens aguardando revisão.`);
      await loadMemories();
    } catch (error: unknown) {
      setError(errorMessage(error, "Falha ao preparar memória inicial."));
    } finally {
      setBootstrapping(false);
    }
  }

  return (
    <div className="grid gap-4">
      <section className="rounded-2xl border border-border bg-card p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Database className="h-5 w-5" /></div>
            <div>
              <h2 className="text-lg font-bold">Memória supervisionada</h2>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Correções do chat e padrões históricos ficam rastreáveis. Apenas itens aprovados influenciam novas respostas.</p>
            </div>
          </div>
          {isAdmin && (
            <button type="button" onClick={prepareInitialMemory} disabled={bootstrapping} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-50">
              {bootstrapping ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Preparar memória inicial
            </button>
          )}
        </div>

        {(notice || error) && <div className={`mt-4 rounded-lg border px-3 py-2 text-sm ${error ? "border-red-500/30 bg-red-500/10 text-red-300" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"}`}>{error || notice}</div>}

        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex gap-1 overflow-x-auto" role="tablist">
            {[
              { id: "pending", label: "Pendentes" },
              { id: "approved", label: "Aprovadas" },
              { id: "rejected", label: "Rejeitadas" },
            ].map((item) => (
              <button key={item.id} type="button" onClick={() => setStatus(item.id)} className={`rounded-lg px-3 py-2 text-sm font-semibold ${status === item.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}>
                {item.label} <span className="ml-1 opacity-70">{countByStatus[item.id] || 0}</span>
              </button>
            ))}
          </div>
          <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
            Filtrar unidade
            <select value={unit} onChange={(event) => setUnit(event.target.value)} className="h-9 min-w-48 rounded-lg border border-input bg-background px-3 text-sm text-foreground">
              <option value="">Todas permitidas</option>
              {allowedUnits.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
        </div>
      </section>

      {loading ? (
        <div className="flex h-48 items-center justify-center rounded-2xl border border-border bg-card text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Carregando memória</div>
      ) : memories.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/60 p-10 text-center">
          <Database className="mx-auto h-8 w-8 text-muted-foreground" />
          <div className="mt-3 font-bold">Nenhuma memória nesta fila</div>
          <p className="mt-1 text-sm text-muted-foreground">Edite uma resposta no chat ou prepare a memória histórica inicial.</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {memories.map((memory) => (
            <article key={memory.id} className="rounded-2xl border border-border bg-card p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded-full bg-primary/10 px-2 py-1 font-bold text-primary">{memory.unit}</span>
                  <span className="rounded-full bg-muted px-2 py-1 font-semibold text-muted-foreground">{memory.sourceType === "chat_correction" ? "Correção no chat" : "Histórico WhatsApp"}</span>
                  <span className="rounded-full bg-muted px-2 py-1 font-semibold text-muted-foreground">{memory.category === "conversation_pattern" ? "Padrão de conversa" : memory.category === "procedure_knowledge" ? "Conhecimento" : "Exemplo"}</span>
                </div>
                <span className="text-xs text-muted-foreground">{formatDate(memory.createdAt)}</span>
              </div>

              <div className="mt-4 rounded-xl border border-border bg-background/60 p-3">
                <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Mensagem do cliente</div>
                <div className="whitespace-pre-wrap text-sm">{memory.triggerText}</div>
              </div>

              <div className={`mt-3 grid gap-3 ${memory.originalAnswer && memory.originalAnswer !== memory.correctedAnswer ? "lg:grid-cols-2" : ""}`}>
                {memory.originalAnswer && memory.originalAnswer !== memory.correctedAnswer && (
                  <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-3">
                    <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-red-300">Resposta original da IA</div>
                    <div className="whitespace-pre-wrap text-sm text-muted-foreground">{memory.originalAnswer}</div>
                  </div>
                )}
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
                  <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-emerald-400">Resposta preparada</div>
                  {editingMemoryId === memory.id ? (
                    <div className="grid gap-2">
                      <textarea value={editingMemoryContent} onChange={(event) => setEditingMemoryContent(event.target.value)} rows={6} autoFocus className="w-full resize-y rounded-lg border border-input bg-background p-3 text-sm text-foreground outline-none focus:border-primary" />
                      <div className="flex justify-end gap-2">
                        <button type="button" onClick={() => setEditingMemoryId(null)} className="inline-flex h-8 items-center gap-1 rounded-md border border-border px-2 text-xs font-semibold"><X className="h-3.5 w-3.5" />Cancelar</button>
                        <button type="button" onClick={() => saveMemoryEdit(memory.id)} disabled={reviewingId === memory.id} className="inline-flex h-8 items-center gap-1 rounded-md bg-primary px-2 text-xs font-semibold text-primary-foreground disabled:opacity-50"><Check className="h-3.5 w-3.5" />Salvar correção</button>
                      </div>
                    </div>
                  ) : <div className="whitespace-pre-wrap text-sm">{memory.correctedAnswer}</div>}
                </div>
              </div>

              <div className="mt-4 flex flex-col gap-3 border-t border-border pt-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-xs text-muted-foreground">
                  Adicionada por {memory.createdByName || "sistema"}
                  {memory.reviewedByName && ` · revisada por ${memory.reviewedByName}`}
                </div>
                {isAdmin && memory.status === "pending" && (
                  <div className="flex gap-2">
                    <button type="button" onClick={() => { setEditingMemoryId(memory.id); setEditingMemoryContent(memory.correctedAnswer); }} disabled={reviewingId === memory.id} className="inline-flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-xs font-bold text-muted-foreground hover:bg-muted disabled:opacity-50"><Edit3 className="h-3.5 w-3.5" />Editar</button>
                    <button type="button" onClick={() => review(memory.id, "reject")} disabled={reviewingId === memory.id} className="inline-flex h-9 items-center gap-2 rounded-lg border border-red-500/30 px-3 text-xs font-bold text-red-300 hover:bg-red-500/10 disabled:opacity-50"><X className="h-3.5 w-3.5" />Rejeitar</button>
                    <button type="button" onClick={() => review(memory.id, "approve")} disabled={reviewingId === memory.id} className="inline-flex h-9 items-center gap-2 rounded-lg bg-emerald-600 px-3 text-xs font-bold text-white hover:bg-emerald-500 disabled:opacity-50">
                      {reviewingId === memory.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}Aprovar
                    </button>
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
