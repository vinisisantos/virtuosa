"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Loader2,
  Pencil,
  RefreshCw,
  Sparkles,
  Trash2,
} from "lucide-react";
import { toast } from "@/components/toast";
import { isAliceUnit } from "@/lib/ai-assistant/scope";
import { readAliceMessageSequence } from "@/lib/ai-assistant/message-sequence";
import { AiAssistantModeBar, type AliceConversationMode } from "./ai-assistant-mode-bar";
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
    sequenceAllowed?: boolean;
    sequence?: { provider: "codex" | "claude"; index: number; messages: [string, string] };
    booking?: { status: "review"; reason: string } | { status: "booked"; confirmation: "submitted" | "uncertain"; startTime: string };
    comparison?: {
      codex: { response: string; messages?: string[] } | null;
      claude: { response: string; messages?: string[] } | null;
      codexError?: string | null;
      claudeError?: string | null;
      selected?: "codex" | "claude";
    };
  } | null;
};
type HandoffStatus = { notified: number; assigned: boolean } | null;

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
  onModeChange: (mode: AliceConversationMode) => void;
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
  const [mode, setMode] = useState<AliceConversationMode>(
    initialMode === "suggestions" ? "suggestions" : String(initialMode) === "agent" && unit === "SBC" ? "agent" : "manual",
  );
  const [draft, setDraft] = useState<AiAssistantDraft | null>(null);
  const [handoffStatus, setHandoffStatus] = useState<HandoffStatus>(null);
  const [loading, setLoading] = useState(false);
  const [changingMode, setChangingMode] = useState(false);
  const handledGenerationRequestRef = useRef<number | null>(null);
  const generationInFlightRef = useRef(false);
  const mountedRef = useRef(false);
  const activeConversationRef = useRef(conversationId);
  activeConversationRef.current = conversationId;
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);
  const apiUrl = useMemo(
    () => endpoint(scopeQuery, conversationId),
    [conversationId, scopeQuery],
  );

  useEffect(() => {
    setMode(initialMode === "suggestions" ? "suggestions" : String(initialMode) === "agent" && unit === "SBC" ? "agent" : "manual");
    setDraft(null);
    setHandoffStatus(null);
    handledGenerationRequestRef.current = null;
  }, [conversationId, initialMode, unit]);

  useEffect(() => {
    setDraft(null);
  }, [conversationId, targetMessage?.id]);

  useEffect(() => {
    if (!isAliceUnit(unit) || mode !== "suggestions" || generationInFlightRef.current) return;
    const controller = new AbortController();
    setDraft(null);
    fetch(apiUrl, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Não foi possível carregar a sugestão.");
        setDraft(data.draft?.status === "active" || data.draft?.status === "inserted" || data.draft?.status === "sent" ? data.draft : null);
      })
      .catch((error) => {
        if (error?.name !== "AbortError") setDraft(null);
      });
    return () => controller.abort();
  }, [activityVersion, apiUrl, mode, unit]);

  const changeMode = useCallback(async (nextMode: AliceConversationMode) => {
    if (changingMode || nextMode === mode) return;
    setChangingMode(true);
    try {
      const response = await fetch(apiUrl, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, action: "mode", mode: nextMode }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Não foi possível alterar o modo.");
      if (!mountedRef.current || activeConversationRef.current !== conversationId) return;
      setMode(nextMode);
      setDraft(null);
      onModeChange(nextMode);
      toast(nextMode === "agent" ? "Modo autônomo ativado nesta conversa." : nextMode === "suggestions" ? "Sugestões ativadas nesta conversa." : "Resposta manual ativada. Alice pausada nesta conversa.", "success");
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
        body: JSON.stringify({ conversationId, campaignName, force, compare: true, targetMessageId: selectedTargetMessageId }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Não foi possível gerar a sugestão.");
      if (mountedRef.current && activeConversationRef.current === conversationId) {
        setDraft(data.draft || null);
        setHandoffStatus(data.handoff || null);
      }
    } catch (error) {
      toast(error instanceof Error ? error.message : "Não foi possível gerar a sugestão.", "error");
    } finally {
      generationInFlightRef.current = false;
      setLoading(false);
    }
  }, [apiUrl, campaignName, conversationId, loading, targetMessage?.id]);

  useEffect(() => {
    if (
      !isAliceUnit(unit)
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
            compare: true,
            targetMessageId,
          }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Não foi possível gerar a sugestão.");
        if (activeConversationRef.current === requestConversationId) {
          setDraft(data.draft || null);
          setHandoffStatus(data.handoff || null);
        }
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

  const insertSuggestion = useCallback(async (provider?: "codex" | "claude") => {
    if (!draft) return;
    try {
      const response = await fetch(apiUrl, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, action: "use", draftId: draft.id, draftVersion: draft.version, provider }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "A sugestão não está mais disponível.");
      if (!mountedRef.current || activeConversationRef.current !== conversationId) return;
      const content = typeof data.content === "string" ? data.content : draft.content;
      const version = Number.isSafeInteger(data.draftVersion) ? data.draftVersion : draft.version;
      onUseSuggestion(content, draft.id, version);
      setDraft((current) => current ? { ...current, content, version, status: "inserted" } : current);
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

  if (!isAliceUnit(unit)) return null;

  return (
    <div className="relative mb-1 w-full">
      <AiAssistantModeBar mode={mode} unit={unit} changingMode={changingMode} onChange={changeMode} />

      {mode === "suggestions" && (
        <div
          className={`${styles.assistantSurface} ${loading ? styles.processing : styles.aiModeActive}`}
          aria-busy={loading}
          aria-live="polite"
        >
          {targetMessage && (
            <div className="mb-2 rounded-lg border border-emerald-500/30 bg-background/65 px-2.5 py-1.5">
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
                <span className="block text-sm font-semibold text-foreground">Preparando sugestões</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">Codex e Claude estão analisando a conversa</span>
              </span>
              <span className={styles.thinkingDots} aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
            </div>
          ) : draft ? (
            <>
              {draft.usage?.booking?.status === "review" && <p role="status" className="mb-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-foreground">{draft.usage.booking.reason}</p>}
              {draft.usage?.booking?.status === "booked" && <p role="status" className="mb-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-foreground">
                Avaliação agendada para {new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(draft.usage.booking.startTime))}.
                {draft.usage.booking.confirmation === "submitted" ? " Confirmação encaminhada ao WhatsApp." : " Não foi possível confirmar o envio; confira o WhatsApp antes de reenviar."}
              </p>}
              {draft.status === "sent" && readAliceMessageSequence(draft.usage)?.index === 0 ? (() => {
                const sequence = readAliceMessageSequence(draft.usage)!;
                return <section className={styles.comparisonOption} aria-label="Segunda mensagem sugerida">
                  <h3 className={styles.comparisonTitle}>Segunda mensagem</h3>
                  <p className={`${styles.comparisonText} mt-1 text-sm leading-5 text-foreground`}>{sequence.messages[1]}</p>
                  <button type="button" onClick={() => void insertSuggestion(sequence.provider)} disabled={loading} className={styles.useButton}>
                    <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Usar e editar
                  </button>
                </section>;
              })() : draft.usage?.comparison ? (
                <div className={styles.comparison} tabIndex={0} aria-label="Comparação das sugestões">
                  {(["codex", "claude"] as const).map((provider) => {
                    const suggestion = draft.usage?.comparison?.[provider];
                    const failure = provider === "codex" ? draft.usage?.comparison?.codexError : draft.usage?.comparison?.claudeError;
                    return (
                      <section className={styles.comparisonOption} key={provider} aria-label={`Sugestão ${provider === "codex" ? "Codex" : "Claude"}`}>
                        <h3 className={styles.comparisonTitle}>{provider === "codex" ? "Codex" : "Claude"}</h3>
                        {suggestion && draft.usage?.sequenceAllowed && suggestion.messages?.length === 2
                          ? suggestion.messages.map((message, index) => <div key={index}>
                            <p className="mt-2 text-xs font-semibold text-muted-foreground">Mensagem {index + 1}</p>
                            <p className={`${styles.comparisonText} mt-1 text-sm leading-5 text-foreground`} tabIndex={0}>{message}</p>
                          </div>)
                          : <p className={`${styles.comparisonText} mt-1 text-sm leading-5 text-foreground`} tabIndex={0}>{suggestion?.response || failure || "Sugestão indisponível."}</p>}
                        {suggestion && <button type="button" onClick={() => void insertSuggestion(provider)} disabled={loading || draft.status === "inserted"} className={styles.useButton}>
                          <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Usar e editar
                        </button>}
                      </section>
                    );
                  })}
                </div>
              ) : <div className="flex items-start gap-2">
                <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                <p className="min-w-0 flex-1 whitespace-pre-wrap break-words text-sm leading-5 text-foreground">{draft.content}</p>
              </div>}
              {draft.usage?.needsHuman && (
                <p className="mt-2 rounded-lg bg-amber-500/10 px-2 py-1.5 text-xs text-amber-800 dark:text-amber-300">
                  A Alice identificou que este atendimento precisa de apoio humano. {handoffStatus
                    ? handoffStatus.notified > 0
                      ? `Notificação interna enviada para ${handoffStatus.notified} pessoa(s) com acesso a esta caixa.`
                      : "Nenhuma pessoa elegível com acesso a esta caixa foi localizada; o acesso não foi ampliado. Acione a equipe manualmente."
                    : "Revise o encaminhamento antes de responder."}
                </p>
              )}
              <div className="mt-2 flex flex-wrap gap-2">
                {!draft.usage?.comparison && <button type="button" onClick={() => void insertSuggestion()} disabled={draft.status === "inserted"} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-xs font-semibold text-white hover:bg-emerald-700 disabled:cursor-default disabled:bg-emerald-700/70">
                  {draft.status === "inserted" ? <Check className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
                  {draft.status === "inserted" ? "Inserida no campo" : "Usar e editar"}
                </button>}
                {draft.usage?.comparison && draft.status === "inserted" && <span className="text-xs text-foreground">Sugestão inserida no campo para revisão.</span>}
                <button type="button" onClick={() => void generate(true)} disabled={loading} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-xs font-semibold hover:bg-muted disabled:opacity-60">
                  {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Gerar outra
                </button>
                {draft.status !== "inserted" && draft.status !== "sent" && (
                  <button type="button" onClick={() => void discard()} disabled={loading} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Descartar sugestão">
                    <Trash2 className="h-3.5 w-3.5" /> Descartar
                  </button>
                )}
              </div>
            </>
          ) : (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                <span className={styles.readyDot} aria-hidden="true" />
                <span><strong className="font-semibold text-foreground">Alice pronta para sugestão.</strong> Codex e Claude são consultados somente quando você pedir.</span>
              </div>
              <button type="button" onClick={() => void generate(false)} disabled={loading} className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">
                {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                {loading ? "Gerando..." : "Comparar sugestões"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
