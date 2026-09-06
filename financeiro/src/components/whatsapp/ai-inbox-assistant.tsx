"use client";

import { useEffect, useRef, useState } from "react";
import { BookOpen, Loader2, Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Content = {
  topic: string;
  questions: string[];
  answer: string;
  procedure: string;
  conditions: string;
  clinical: boolean;
};
type Ficha = {
  id: string;
  content: Content;
  status: string;
  version: number;
  relatedIds: string[];
  expiresAt: string | null;
  sourceConversationId: string | null;
  sourceInstanceId: string | null;
};
type Suggestion = {
  id: string;
  text: string;
  reason: string;
  needsHuman: boolean;
  sources: { id: string; topic: string }[];
};
type Listing = {
  items: Ficha[];
  canReview: boolean;
  canReviewClinical: boolean;
  summary: { queued: number; failed: number; budget: string | null };
};
type Props = {
  conversationId: string;
  contextKey: string;
  buildUrl: (url: string, extra?: Record<string, string>) => string;
  onInsert: (text: string) => void;
  hasDraft: boolean;
};

const button =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border px-3 py-2 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed";
const field =
  "mt-1 w-full min-w-0 rounded-lg border border-input bg-background p-2.5 text-base outline-none focus:border-primary sm:text-sm";

async function jsonRequest(url: string, options?: RequestInit) {
  const response = await fetch(url, {
    ...options,
    cache: "no-store",
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error || "Não foi possível concluir esta ação");
  return result;
}

function KnowledgeEditor({
  item,
  canReviewClinical,
  busy,
  onSave,
}: {
  item: Ficha;
  canReviewClinical: boolean;
  busy: boolean;
  onSave: (body: object) => void;
}) {
  const [content, setContent] = useState(item.content);
  const [expiresAt, setExpiresAt] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const changed = JSON.stringify(content) !== JSON.stringify(item.content);
  const send = (action: string) =>
    onSave({
      id: item.id,
      version: item.version,
      action,
      content,
      confirmed,
      expiresAt: expiresAt ? `${expiresAt}T23:59:59-03:00` : undefined,
    });
  return (
    <div className="mt-3 space-y-3 border-t pt-3">
      <label className="block text-sm">
        Assunto
        <input
          className={field}
          value={content.topic}
          maxLength={140}
          onChange={(e) => setContent({ ...content, topic: e.target.value })}
        />
      </label>
      <label className="block text-sm">
        Perguntas equivalentes (uma por linha)
        <textarea
          className={field}
          rows={3}
          value={content.questions.join("\n")}
          onChange={(e) =>
            setContent({
              ...content,
              questions: e.target.value.split("\n").slice(0, 5),
            })
          }
        />
      </label>
      <label className="block text-sm">
        Resposta geral, sem dados pessoais
        <textarea
          className={field}
          rows={5}
          maxLength={2400}
          value={content.answer}
          onChange={(e) => setContent({ ...content, answer: e.target.value })}
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          Procedimento / protocolo
          <input
            className={field}
            value={content.procedure}
            maxLength={160}
            onChange={(e) =>
              setContent({ ...content, procedure: e.target.value })
            }
          />
        </label>
        <label className="block text-sm">
          Revisar até
          <input
            type="date"
            className={field}
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
          />
          <span className="text-xs text-muted-foreground">
            Obrigatório para aprovar · até 90 dias
          </span>
        </label>
      </div>
      <label className="block text-sm">
        Condições e limites
        <textarea
          className={field}
          rows={2}
          value={content.conditions}
          maxLength={800}
          onChange={(e) =>
            setContent({ ...content, conditions: e.target.value })
          }
        />
      </label>
      <label className="flex min-h-11 items-center gap-3 text-sm">
        <input
          type="checkbox"
          checked={content.clinical}
          disabled={item.content.clinical && !canReviewClinical}
          onChange={(e) =>
            setContent({ ...content, clinical: e.target.checked })
          }
        />
        Conteúdo clínico / procedimento / pós-procedimento
      </label>
      <label className="flex min-h-11 items-start gap-3 text-sm leading-6">
        <input
          type="checkbox"
          className="mt-1.5 shrink-0"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
        />
        Conferi a origem, retirei dados pessoais e confirmei condições, validade
        e possíveis conflitos.
      </label>
      {content.clinical && !canReviewClinical && (
        <p className="text-sm text-amber-600 dark:text-amber-400">
          A aprovação desta ficha depende da responsável técnica cadastrada.
        </p>
      )}
      {changed && (
        <p className="text-xs text-muted-foreground">
          Salve a correção primeiro. Ela ficará pendente e precisará ser
          aprovada novamente.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          className={button}
          disabled={busy || !changed}
          onClick={() => send("edit")}
        >
          Salvar correção
        </button>
        <button
          className={`${button} bg-primary text-primary-foreground`}
          disabled={
            busy ||
            changed ||
            !confirmed ||
            !expiresAt ||
            (content.clinical && !canReviewClinical)
          }
          onClick={() => send("approve")}
        >
          Aprovar ficha
        </button>
        <button
          className={button}
          disabled={busy}
          onClick={() =>
            send(item.status === "approved" ? "disable" : "reject")
          }
        >
          {item.status === "approved" ? "Desativar" : "Rejeitar"}
        </button>
      </div>
    </div>
  );
}

export function AiInboxAssistant({
  conversationId,
  contextKey,
  buildUrl,
  onInsert,
  hasDraft,
}: Props) {
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [suggestionKey, setSuggestionKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [listing, setListing] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(false);
  const [panelError, setPanelError] = useState("");
  const [status, setStatus] = useState("pending");
  const [offset, setOffset] = useState(0);
  const [editing, setEditing] = useState("");
  const generation = useRef(0);
  const listVersion = useRef(0);
  const liveContext = useRef(contextKey);
  liveContext.current = contextKey;
  useEffect(
    () => () => {
      generation.current++;
      listVersion.current++;
    },
    [],
  );
  const validSuggestion =
    suggestion && suggestionKey === contextKey ? suggestion : null;

  async function generate() {
    const seq = ++generation.current;
    const key = contextKey;
    setBusy(true);
    setError("");
    setSuggestion(null);
    try {
      const result = await jsonRequest(
        buildUrl("/api/whatsapp/reply-suggestions"),
        {
          method: "POST",
          body: JSON.stringify({ action: "generate", conversationId }),
        },
      );
      if (seq === generation.current && liveContext.current === key) {
        setSuggestion(result);
        setSuggestionKey(key);
      } else if (seq === generation.current)
        setError("A conversa mudou durante a geração. Gere uma nova sugestão.");
    } catch (e) {
      if (seq === generation.current)
        setError(e instanceof Error ? e.message : "Falha na sugestão");
    } finally {
      if (seq === generation.current) setBusy(false);
    }
  }
  async function apply() {
    if (!validSuggestion) return;
    const seq = ++generation.current;
    const key = contextKey;
    setBusy(true);
    setError("");
    try {
      const result = await jsonRequest(
        buildUrl("/api/whatsapp/reply-suggestions"),
        {
          method: "POST",
          body: JSON.stringify({
            action: "apply",
            conversationId,
            operationId: validSuggestion.id,
          }),
        },
      );
      if (seq === generation.current && key === liveContext.current) {
        onInsert(result.text);
        setSuggestion(null);
      } else if (seq === generation.current)
        setError("A conversa mudou. A sugestão não foi inserida.");
    } catch (e) {
      if (seq === generation.current) {
        setError(e instanceof Error ? e.message : "Falha ao aplicar");
        setSuggestion(null);
      }
    } finally {
      if (seq === generation.current) setBusy(false);
    }
  }
  async function load(nextStatus = status, nextOffset = offset) {
    const seq = ++listVersion.current;
    setLoading(true);
    setPanelError("");
    setEditing("");
    setListing(null);
    setStatus(nextStatus);
    setOffset(nextOffset);
    try {
      const result = await jsonRequest(
        buildUrl("/api/whatsapp/ai-inbox/knowledge", {
          status: nextStatus,
          offset: String(nextOffset),
        }),
      );
      if (seq === listVersion.current) setListing(result);
    } catch (e) {
      if (seq === listVersion.current)
        setPanelError(e instanceof Error ? e.message : "Erro ao carregar");
    } finally {
      if (seq === listVersion.current) setLoading(false);
    }
  }
  async function review(body: object) {
    setLoading(true);
    setPanelError("");
    try {
      await jsonRequest(buildUrl("/api/whatsapp/ai-inbox/knowledge"), {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      setSuggestion(null);
      await load();
    } catch (e) {
      setPanelError(e instanceof Error ? e.message : "Falha na revisão");
      setLoading(false);
    }
  }
  const budget = listing?.summary.budget
    ? (JSON.parse(listing.summary.budget) as {
        reserved: number;
        suggestions: number;
        batches: number;
      })
    : { reserved: 0, suggestions: 0, batches: 0 };
  return (
    <section
      className="min-w-0 shrink-0 border-t border-primary/15 bg-primary/5 px-3 py-2 sm:px-5"
      aria-label="Assistente de respostas SCS"
    >
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void generate()}
          disabled={busy}
          className={`${button} text-primary`}
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}{" "}
          {busy ? "Analisando…" : "Sugerir resposta"}
        </button>
        <button
          type="button"
          className={button}
          onClick={() => {
            setOpen(true);
            void load("pending", 0);
          }}
        >
          <BookOpen className="h-4 w-4" />
          Aprendizados
        </button>
        <span className="text-xs text-muted-foreground">
          Piloto SCS · envio manual
        </span>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}
      {suggestion && !validSuggestion && (
        <p role="status" className="mt-2 text-xs text-muted-foreground">
          A conversa mudou. Gere outra sugestão.
        </p>
      )}
      {validSuggestion && (
        <div className="mt-2 max-h-[28dvh] space-y-2 overflow-y-auto rounded-xl border border-border bg-card p-3 text-sm">
          <p className="break-words text-muted-foreground">
            {validSuggestion.reason}
          </p>
          {validSuggestion.text && (
            <p className="whitespace-pre-wrap break-words">
              {validSuggestion.text}
            </p>
          )}
          {validSuggestion.sources.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Base aprovada:{" "}
              {validSuggestion.sources.map((s) => s.topic).join(" · ")}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {!validSuggestion.needsHuman && (
              <button
                type="button"
                className={`${button} bg-primary text-primary-foreground`}
                disabled={busy}
                onClick={() => void apply()}
              >
                {hasDraft ? "Acrescentar ao rascunho" : "Usar no rascunho"}
              </button>
            )}
            <button
              type="button"
              className={button}
              onClick={() => setSuggestion(null)}
            >
              Dispensar
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            Confira antes de enviar. Nenhuma mensagem é enviada por este botão.
          </p>
        </div>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[90dvh] max-w-[calc(100%-1rem)] flex-col overflow-hidden p-4 sm:max-w-3xl [&_[data-slot=dialog-close]]:size-11">
          <DialogHeader className="shrink-0 pr-8">
            <DialogTitle>Aprendizados · SCS</DialogTitle>
            <DialogDescription>
              Respostas observadas viram fichas para revisão. Só conhecimento
              aprovado e vigente é usado nas sugestões.
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 space-y-4 overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom)]">
            {listing && (
              <div className="rounded-xl bg-muted p-3 text-xs leading-6">
                <p>
                  Fila desta caixa: {listing.summary.queued} · requerem atenção:{" "}
                  {listing.summary.failed}
                </p>
                <p>
                  Reserva do dia em SCS: US${" "}
                  {(budget.reserved / 1e6).toFixed(2)} / 5,00 ·{" "}
                  {budget.suggestions}/100 sugestões · {budget.batches}/40 lotes
                </p>
                <p>
                  A reserva é conservadora; não representa necessariamente o
                  gasto faturado.
                </p>
              </div>
            )}
            <div
              className="flex flex-wrap gap-2"
              aria-label="Filtrar aprendizados"
            >
              {[
                ["pending", "Pendentes"],
                ["approved", "Aprovados"],
                ["rejected", "Rejeitados"],
                ["disabled", "Desativados"],
              ].map(([value, label]) => (
                <button
                  type="button"
                  key={value}
                  className={`${button} ${status === value ? "border-primary text-primary" : ""}`}
                  disabled={loading}
                  aria-pressed={status === value}
                  onClick={() => void load(value, 0)}
                >
                  {label}
                </button>
              ))}
              <button
                type="button"
                className={button}
                disabled={loading}
                onClick={() => void load()}
              >
                Atualizar
              </button>
              {!!listing?.summary.failed && listing.canReview && (
                <button
                  type="button"
                  className={button}
                  disabled={loading}
                  onClick={() => {
                    setLoading(true);
                    void jsonRequest(
                      buildUrl("/api/whatsapp/ai-inbox/knowledge"),
                      {
                        method: "POST",
                        body: JSON.stringify({ action: "retry-failed" }),
                      },
                    )
                      .then(() => load())
                      .catch((e) => {
                        setPanelError(
                          e instanceof Error ? e.message : "Erro ao retomar",
                        );
                        setLoading(false);
                      });
                  }}
                >
                  Retomar falhas da fila
                </button>
              )}
            </div>
            {panelError && (
              <p
                role="alert"
                className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive"
              >
                {panelError}
              </p>
            )}
            {loading && (
              <p role="status" className="flex items-center gap-2 py-4 text-sm">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando…
              </p>
            )}
            {!loading && listing?.items.length === 0 && (
              <p className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">
                Nenhuma ficha neste filtro. Novas respostas da equipe serão
                observadas em lotes após a ativação; não há importação
                automática de conversas antigas.
              </p>
            )}
            {listing?.items.slice(0, 20).map((item) => (
              <article
                key={`${item.id}:${item.version}`}
                className="min-w-0 rounded-xl border border-border p-3 sm:p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h3 className="min-w-0 break-words font-semibold">
                    {item.content.topic}
                  </h3>
                  <span className="text-xs text-muted-foreground">
                    v{item.version} ·{" "}
                    {item.content.clinical ? "Revisão técnica" : "Geral"}
                  </span>
                </div>
                <p className="mt-2 break-words text-xs text-muted-foreground">
                  {item.content.questions.join(" / ")}
                </p>
                <p className="mt-2 whitespace-pre-wrap break-words text-sm">
                  {item.content.answer}
                </p>
                {item.content.procedure && (
                  <p className="mt-2 break-words text-xs">
                    Procedimento: {item.content.procedure}
                  </p>
                )}
                {item.content.conditions && (
                  <p className="mt-2 break-words text-xs text-muted-foreground">
                    Condições: {item.content.conditions}
                  </p>
                )}
                {item.expiresAt && (
                  <p className="mt-2 text-xs">
                    Revisão até:{" "}
                    {new Date(item.expiresAt).toLocaleDateString("pt-BR")}
                  </p>
                )}
                {item.relatedIds.length > 0 && (
                  <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                    Há {item.relatedIds.length} ficha(s) semelhante(s). Confira
                    duplicidades e divergências antes de aprovar.
                  </p>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  {item.sourceConversationId && (
                    <a
                      className={button}
                      href={`/crm/inbox?conversationId=${encodeURIComponent(item.sourceConversationId)}&targetInstanceId=${encodeURIComponent(item.sourceInstanceId || "")}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Ver conversa de origem
                    </a>
                  )}
                  {listing.canReview && item.sourceConversationId && (
                    <button
                      type="button"
                      className={button}
                      onClick={() =>
                        setEditing(editing === item.id ? "" : item.id)
                      }
                    >
                      {editing === item.id
                        ? "Recolher revisão"
                        : "Revisar ficha"}
                    </button>
                  )}
                </div>
                {editing === item.id && (
                  <KnowledgeEditor
                    key={`${item.id}:${item.version}`}
                    item={item}
                    canReviewClinical={listing.canReviewClinical}
                    busy={loading}
                    onSave={(body) => void review(body)}
                  />
                )}
              </article>
            ))}
            <div className="flex justify-between gap-2">
              <button
                type="button"
                className={button}
                disabled={loading || offset === 0}
                onClick={() => void load(status, Math.max(0, offset - 20))}
              >
                Anterior
              </button>
              <button
                type="button"
                className={button}
                disabled={loading || !listing || listing.items.length <= 20}
                onClick={() => void load(status, offset + 20)}
              >
                Próxima
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
