"use client";

import { Loader2, MessageSquareText, Settings2 } from "lucide-react";

import type { SavedReply } from "@/hooks/use-whatsapp-saved-replies";

export type SavedReplyTrigger = {
  start: number;
  end: number;
  query: string;
};

export function findSavedReplyTrigger(value: string, cursor: number): SavedReplyTrigger | null {
  const textBeforeCursor = value.slice(0, cursor);
  const match = textBeforeCursor.match(/(?:^|\s)\/([^\s/]*)$/u);
  if (!match) return null;

  const start = textBeforeCursor.lastIndexOf("/");
  return { start, end: cursor, query: match[1] || "" };
}

function normalizeSearch(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");
}

export function savedReplyCommand(reply: SavedReply) {
  const slug = normalizeSearch(reply.title)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `/${slug || "resposta"}`;
}

export function filterSavedReplies(replies: SavedReply[], query: string) {
  const normalizedQuery = normalizeSearch(query).replace(/^\//, "");
  if (!normalizedQuery) return replies.slice(0, 6);

  return replies
    .filter((reply) => {
      const haystack = normalizeSearch(`${savedReplyCommand(reply)}\n${reply.title}\n${reply.content}`);
      return haystack.includes(normalizedQuery);
    })
    .slice(0, 6);
}

type Props = {
  open: boolean;
  query: string;
  replies: SavedReply[];
  loading: boolean;
  error?: string | null;
  activeIndex: number;
  onActiveIndexChange: (index: number) => void;
  onSelect: (reply: SavedReply) => void;
  onManage: () => void;
};

export function SavedRepliesComposerMenu({
  open,
  query,
  replies,
  loading,
  error,
  activeIndex,
  onActiveIndexChange,
  onSelect,
  onManage,
}: Props) {
  if (!open) return null;

  const filteredReplies = filterSavedReplies(replies, query);

  return (
    <div
      className="absolute bottom-[calc(100%+0.5rem)] left-0 right-0 z-50 overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-xl"
    >
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <MessageSquareText className="h-4 w-4 shrink-0 text-primary" />
          <span className="truncate text-xs font-semibold">Respostas rápidas</span>
        </div>
        <span className="shrink-0 text-[10px] text-muted-foreground">↑↓ navegar · Enter inserir</span>
      </div>

      <div
        className="max-h-[min(44dvh,320px)] overflow-y-auto overscroll-contain p-1.5"
        role="listbox"
        aria-label="Respostas rápidas"
      >
        {loading ? (
          <div className="flex min-h-24 items-center justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : error ? (
          <div className="px-4 py-5 text-center">
            <p className="text-sm font-semibold text-destructive">Não foi possível carregar os atalhos</p>
            <p className="mt-1 text-xs text-muted-foreground">Feche e digite / novamente para tentar outra vez.</p>
          </div>
        ) : filteredReplies.length > 0 ? (
          filteredReplies.map((reply, index) => (
            <button
              key={reply.id}
              type="button"
              role="option"
              aria-selected={index === activeIndex}
              onMouseEnter={() => onActiveIndexChange(index)}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onSelect(reply)}
              className={`block w-full rounded-lg px-3 py-2.5 text-left transition-colors ${
                index === activeIndex ? "bg-primary/10 text-foreground" : "hover:bg-muted"
              }`}
            >
              <span className="flex min-w-0 items-baseline gap-2">
                <span className="truncate text-sm font-semibold">{reply.title}</span>
                <span className="shrink-0 font-mono text-[10px] text-primary">{savedReplyCommand(reply)}</span>
              </span>
              <span className="mt-0.5 line-clamp-1 block whitespace-pre-line text-xs text-muted-foreground">
                {reply.content}
              </span>
            </button>
          ))
        ) : (
          <div className="px-4 py-5 text-center">
            <p className="text-sm font-semibold text-foreground">
              {query ? "Nenhum atalho encontrado" : "Nenhum atalho salvo"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {query ? "Continue digitando ou gerencie suas respostas." : "Crie sua primeira resposta rápida."}
            </p>
          </div>
        )}
      </div>

      <button
        type="button"
        onMouseDown={(event) => event.preventDefault()}
        onClick={onManage}
        className="flex min-h-11 w-full items-center justify-center gap-2 border-t border-border px-3 text-xs font-semibold text-primary transition-colors hover:bg-primary/5"
      >
        <Settings2 className="h-4 w-4" />
        Gerenciar respostas rápidas
      </button>
    </div>
  );
}
