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
  onUseSuggestion: (content: string, draftId: string) => void;
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
        body: JSON.stringify({ conversationId, action: "use", draftId: draft.id }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "A sugestão não está mais disponível.");
      onUseSuggestion(draft.content, draft.id);
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
      body: JSON.stringify({ conversationId, action: "discard", draftId: draft.id }),
    });
    if (response.ok) setDraft(null);
  }, [apiUrl, conversationId, draft]);

  if (unit !== "SBC") return null;

  return (
    <div className="relative mx-auto mb-1 w-full max-w-3xl">
      <button
        type="button"
        onClick={() => setMenuOpen((current) => !current)}
        className={`inline-flex min-h-9 items-center gap-2 rounded-full border px-3 text-xs font-semibold transition-colors ${
          mode === "suggestions"
            ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/15 dark:text-emerald-300"
            : "border-border bg-background/80 text-muted-foreground hover:bg-muted hover:text-foreground"
        }`}
        aria-expanded={menuOpen}
      >
        {mode === "suggestions" ? <Sparkles className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
        {mode === "suggestions" ? "Sugestões" : "Minha resposta"}
        {changingMode ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>

      {menuOpen && (
        <div className="absolute bottom-11 left-0 z-40 w-[min(92vw,390px)] overflow-hidden rounded-2xl border border-border bg-popover p-2 text-popover-foreground shadow-2xl">
          <div className="flex items-center justify-between px-2 py-1.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Selecionar modo</p>
            <button type="button" onClick={() => setMenuOpen(false)} className="rounded-full p-1.5 hover:bg-muted" aria-label="Fechar">
              <X className="h-4 w-4" />
            </button>
          </div>
          <button
            type="button"
            onClick={() => void changeMode("manual")}
            className="flex min-h-14 w-full items-center gap-3 rounded-xl px-3 text-left hover:bg-muted"
          >
            <Pencil className="h-5 w-5 text-muted-foreground" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">Minha resposta</span>
              <span className="block text-xs text-muted-foreground">Você escreve e envia sem assistência da IA.</span>
            </span>
            {mode === "manual" && <Check className="h-5 w-5 text-primary" />}
          </button>
          <button
            type="button"
            onClick={() => void changeMode("suggestions")}
            className="flex min-h-14 w-full items-center gap-3 rounded-xl px-3 text-left hover:bg-muted"
          >
            <Sparkles className="h-5 w-5 text-emerald-600" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">Sugestões</span>
              <span className="block text-xs text-muted-foreground">A IA sugere; você revisa, edita e envia.</span>
            </span>
            {mode === "suggestions" && <Check className="h-5 w-5 text-primary" />}
          </button>
          <div className="flex min-h-14 items-center gap-3 rounded-xl px-3 opacity-55" aria-disabled="true">
            <Bot className="h-5 w-5" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">Agente de IA</span>
              <span className="block text-xs">Envio automático bloqueado neste piloto.</span>
            </span>
            <LockKeyhole className="h-4 w-4" />
          </div>
        </div>
      )}

      {mode === "suggestions" && (
        <div className="mt-1.5 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.07] p-2.5">
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
          {draft ? (
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
                <Sparkles className="h-4 w-4 shrink-0 text-emerald-600" />
                A IA só será consultada quando você pedir.
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
