"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  Check,
  ChevronDown,
  Loader2,
  LockKeyhole,
  Pencil,
  RefreshCw,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "@/components/toast";
import type { Conversation } from "@/lib/whatsapp/inbox-utils";
import styles from "./ai-assistant-composer.module.css";

type AiAssistantDraft = {
  id: string;
  content: string;
  status: string;
  version: number;
  updatedAt: string;
  usage?: {
    confidence?: "high" | "medium" | "low";
    needsHuman?: boolean;
  } | null;
};

type Props = {
  conversationId: string;
  campaignName?: string | null;
  activityVersion?: string | null;
  unit: string;
  initialMode?: Conversation["aiMode"];
  scopeQuery: string;
  targetMessage?: { id: string; preview: string } | null;
  generationRequest?: { requestId: number; conversationId: string; targetMessageId: string } | null;
  onGenerationRequestHandled?: (requestId: number) => void;
  onModeChange: (mode: "manual" | "suggestions") => void;
  onUseSuggestion: (content: string, draftId: string, draftVersion: number) => void;
};

function endpoint(scopeQuery: string, conversationId: string) {
  const params = new URLSearchParams(scopeQuery);
  params.set("conversationId", conversationId);
  return `/api/crm/ai-assistant/suggestions?${params.toString()}`;
}

export function AiAssistantComposer({
  conversationId,
  campaignName,
  activityVersion,
  unit,
  initialMode,
  scopeQuery,
  targetMessage,
  generationRequest,
  onGenerationRequestHandled,
  onModeChange,
  onUseSuggestion,
}: Props) {
  const [mode, setMode] = useState<"manual" | "suggestions">(
    initialMode === "suggestions" ? "suggestions" : "manual",
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const [draft, setDraft] = useState<AiAssistantDraft | null>(null);
  const [loading, setLoading] = useState(false);
  const [changingMode, setChangingMode] = useState(false);
  const handledGenerationRequestRef = useRef<number | null>(null);
  const generationInFlightRef = useRef(false);
  const activeConversationRef = useRef(conversationId);
  activeConversationRef.current = conversationId;
  const apiUrl = useMemo(
    () => endpoint(scopeQuery, conversationId),
    [conversationId, scopeQuery],
  );

  useEffect(() => {
    setMode(initialMode === "suggestions" ? "suggestions" : "manual");
    setMenuOpen(false);
    setDraft(null);
    handledGenerationRequestRef.current = null;
  }, [conversationId, initialMode]);

  useEffect(() => {
    setDraft(null);
  }, [conversationId, targetMessage?.id]);

  useEffect(() => {
    if (unit !== "SBC" || mode !== "suggestions" || generationInFlightRef.current) return;
    const controller = new AbortController();
    setDraft(null);
    fetch(apiUrl, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Não foi possível carregar a sugestão.");
        setDraft(data.draft?.status === "active" || data.draft?.status === "inserted" ? data.draft : null);
      })
      .catch((error) => {
        if (error?.name !== "AbortError") setDraft(null);
      });
    return () => controller.abort();
  }, [activityVersion, apiUrl, mode, unit]);

  const changeMode = useCallback(async (nextMode: "manual" | "suggestions") => {
    if (changingMode || nextMode === mode) {
      setMenuOpen(false);
      return;
    }
    setChangingMode(true);
    try {
      const response = await fetch(apiUrl, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, action: "mode", mode: nextMode }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Não foi possível alterar o modo.");
      setMode(nextMode);
      setDraft(null);
      setMenuOpen(false);
      onModeChange(nextMode);
      toast(nextMode === "suggestions" ? "Sugestões ativadas nesta conversa." : "Resposta manual ativada.", "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Não foi possível alterar o modo.", "error");
    } finally {
      setChangingMode(false);
    }
  }, [apiUrl, changingMode, conversationId, mode, onModeChange]);

  const generate = useCallback(async (force = false, selectedTargetMessageId = targetMessage?.id || null) => {
    if (loading || generationInFlightRef.current) return;
    generationInFlightRef.current = true;
    setLoading(true);
    try {
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, campaignName, force, targetMessageId: selectedTargetMessageId }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Não foi possível gerar a sugestão.");
      setDraft(data.draft || null);
    } catch (error) {
      toast(error instanceof Error ? error.message : "Não foi possível gerar a sugestão.", "error");
    } finally {
      generationInFlightRef.current = false;
      setLoading(false);
    }
  }, [apiUrl, campaignName, conversationId, loading, targetMessage?.id]);

  useEffect(() => {
    if (
      unit !== "SBC"
      || !generationRequest
      || generationRequest.conversationId !== conversationId
      || handledGenerationRequestRef.current === generationRequest.requestId
      || loading
      || changingMode
    ) return;

    handledGenerationRequestRef.current = generationRequest.requestId;
    generationInFlightRef.current = true;
    const requestConversationId = conversationId;
    const requestId = generationRequest.requestId;
    const targetMessageId = generationRequest.targetMessageId;
    const activateSuggestions = mode !== "suggestions";
    if (activateSuggestions) setChangingMode(true);
    setLoading(true);

    void (async () => {
      try {
        if (activateSuggestions) {
          const modeResponse = await fetch(apiUrl, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ conversationId: requestConversationId, action: "mode", mode: "suggestions" }),
          });
          const modeData = await modeResponse.json().catch(() => ({}));
          if (!modeResponse.ok) throw new Error(modeData.error || "Não foi possível ativar as sugestões.");
          if (activeConversationRef.current === requestConversationId) {
            setMode("suggestions");
            setDraft(null);
            setMenuOpen(false);
            onModeChange("suggestions");
          }
        }

        const response = await fetch(apiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversationId: requestConversationId,
            campaignName,
            force: true,
            targetMessageId,
          }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Não foi possível gerar a sugestão.");
        if (activeConversationRef.current === requestConversationId) setDraft(data.draft || null);
      } catch (error) {
        if (activeConversationRef.current === requestConversationId) {
          toast(error instanceof Error ? error.message : "Não foi possível gerar a sugestão.", "error");
        }
      } finally {
        generationInFlightRef.current = false;
        if (activeConversationRef.current === requestConversationId) {
          setLoading(false);
          setChangingMode(false);
        }
        onGenerationRequestHandled?.(requestId);
      }
    })();
  }, [
    apiUrl,
    campaignName,
    changingMode,
    conversationId,
    generationRequest,
    loading,
    mode,
    onGenerationRequestHandled,
    onModeChange,
    unit,
  ]);

  const useSuggestion = useCallback(async () => {
    if (!draft) return;
    try {
      const response = await fetch(apiUrl, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, action: "use", draftId: draft.id, draftVersion: draft.version }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "A sugestão não está mais disponível.");
      onUseSuggestion(draft.content, draft.id, draft.version);
      setDraft((current) => current ? { ...current, status: "inserted" } : current);
      setMenuOpen(false);
    } catch (error) {
      toast(error instanceof Error ? error.message : "Não foi possível usar a sugestão.", "error");
    }
  }, [apiUrl, conversationId, draft, onUseSuggestion]);

  const discard = useCallback(async () => {
    if (!draft) return;
    const response = await fetch(apiUrl, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, action: "discard", draftId: draft.id, draftVersion: draft.version }),
    });
    if (response.ok) setDraft(null);
  }, [apiUrl, conversationId, draft]);

  if (unit !== "SBC") return null;

  return (
    <div className="relative mx-auto mb-1 w-full max-w-3xl">
      <div className="relative w-fit max-w-full">
        <div
          className={`${styles.modeControlShell} ${
            mode === "suggestions" ? styles.aiModeActive : styles.manualMode
          } ${changingMode ? styles.processing : ""}`}
        >
          <button
            type="button"
            onClick={() => setMenuOpen((current) => !current)}
            className={styles.modeControl}
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            aria-label={`Modo de resposta: ${mode === "suggestions" ? "Sugestões da IA" : "Resposta manual"}`}
          >
            <span className={`${styles.modeIcon} ${mode === "suggestions" ? styles.aiIcon : ""}`}>
              {mode === "suggestions" ? <Sparkles className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
            </span>
            <span className="min-w-0 flex-1 text-left">
              <span className={styles.modeLabel}>
                {mode === "suggestions" ? "Sugestões da IA" : "Resposta manual"}
              </span>
              <span className={styles.modeCaption}>
                {mode === "suggestions" ? "IA disponível" : "Você escreve e envia"}
              </span>
            </span>
            <span className={styles.modeChevron}>
              {changingMode ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronDown className="h-4 w-4" />}
            </span>
          </button>
        </div>

        {menuOpen && (
          <div
            className="absolute bottom-full left-0 z-40 mb-2 w-[min(calc(100vw-2rem),400px)] overflow-hidden rounded-2xl border border-border bg-popover p-2.5 text-popover-foreground shadow-2xl"
            role="menu"
            aria-label="Selecionar modo de resposta"
          >
          <div className="flex items-center justify-between px-2 pb-2 pt-1">
            <div>
              <p className="text-sm font-semibold text-foreground">Como deseja responder?</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Você pode trocar de modo a qualquer momento.</p>
            </div>
            <button type="button" onClick={() => setMenuOpen(false)} className="rounded-full p-2 hover:bg-muted" aria-label="Fechar">
              <X className="h-4 w-4" />
            </button>
          </div>
          <button
            type="button"
            onClick={() => void changeMode("manual")}
            className={`flex min-h-16 w-full items-center gap-3 rounded-xl border px-3 text-left transition-colors ${
              mode === "manual"
                ? "border-foreground/10 bg-muted/80"
                : "border-transparent hover:border-border hover:bg-muted/60"
            }`}
            role="menuitemradio"
            aria-checked={mode === "manual"}
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-background text-foreground shadow-sm ring-1 ring-border">
              <Pencil className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">Resposta manual</span>
              <span className="mt-0.5 block text-xs leading-4 text-muted-foreground">Você escreve e envia sem assistência da IA.</span>
            </span>
            {mode === "manual" && <Check className="h-5 w-5 shrink-0 text-emerald-600" />}
          </button>
          <button
            type="button"
            onClick={() => void changeMode("suggestions")}
            className={`mt-1 flex min-h-16 w-full items-center gap-3 rounded-xl border px-3 text-left transition-colors ${
              mode === "suggestions"
                ? "border-emerald-500/25 bg-emerald-500/[0.08]"
                : "border-transparent hover:border-emerald-500/20 hover:bg-emerald-500/[0.06]"
            }`}
            role="menuitemradio"
            aria-checked={mode === "suggestions"}
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 shadow-sm ring-1 ring-emerald-500/20 dark:text-emerald-300">
              <Sparkles className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">Sugestões da IA</span>
              <span className="mt-0.5 block text-xs leading-4 text-muted-foreground">A IA prepara; você revisa, edita e envia.</span>
            </span>
            {mode === "suggestions" && <Check className="h-5 w-5 shrink-0 text-emerald-600" />}
          </button>
          <div className="mt-1 flex min-h-16 items-center gap-3 rounded-xl border border-transparent px-3 opacity-55" aria-disabled="true">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted ring-1 ring-border">
              <Bot className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">Agente de IA</span>
              <span className="mt-0.5 block text-xs leading-4">Envio automático bloqueado neste piloto.</span>
            </span>
            <LockKeyhole className="h-4 w-4" />
          </div>
          </div>
        )}
      </div>

      {mode === "suggestions" && (
        <div
          className={`${styles.assistantSurface} ${loading ? styles.processing : styles.aiModeActive}`}
          aria-busy={loading}
          aria-live="polite"
        >
          {targetMessage && (
            <div className="mb-2 rounded-lg border-l-2 border-emerald-500 bg-background/65 px-2.5 py-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                Respondendo esta mensagem
              </p>
              <p className="line-clamp-2 break-words text-xs leading-4 text-muted-foreground">
                {targetMessage.preview}
              </p>
            </div>
          )}
          {loading && !draft ? (
            <div className={styles.processingState}>
              <span className={styles.processingOrb} aria-hidden="true">
                <Sparkles className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-foreground">A IA está preparando a resposta</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">Analisando o contexto da conversa</span>
              </span>
              <span className={styles.thinkingDots} aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
            </div>
          ) : draft ? (
            <>
              <div className="flex items-start gap-2">
                <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                <p className="min-w-0 flex-1 whitespace-pre-wrap break-words text-sm leading-5 text-foreground">{draft.content}</p>
              </div>
              {draft.usage?.needsHuman && (
                <p className="mt-2 rounded-lg bg-amber-500/10 px-2 py-1.5 text-xs text-amber-800 dark:text-amber-300">
                  A IA encontrou incerteza. Revise com atenção antes de usar.
                </p>
              )}
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" onClick={() => void useSuggestion()} disabled={draft.status === "inserted"} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-xs font-semibold text-white hover:bg-emerald-700 disabled:cursor-default disabled:bg-emerald-700/70">
                  {draft.status === "inserted" ? <Check className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
                  {draft.status === "inserted" ? "Inserida no campo" : "Usar e editar"}
                </button>
                <button type="button" onClick={() => void generate(true)} disabled={loading} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-xs font-semibold hover:bg-muted disabled:opacity-60">
                  {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Gerar outra
                </button>
                {draft.status !== "inserted" && (
                  <button type="button" onClick={() => void discard()} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Descartar sugestão">
                    <Trash2 className="h-3.5 w-3.5" /> Descartar
                  </button>
                )}
              </div>
            </>
          ) : (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                <span className={styles.readyDot} aria-hidden="true" />
                <span><strong className="font-semibold text-foreground">IA disponível.</strong> Ela só será consultada quando você pedir.</span>
              </div>
              <button type="button" onClick={() => void generate(false)} disabled={loading} className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">
                {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                {loading ? "Gerando..." : "Gerar sugestão"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
