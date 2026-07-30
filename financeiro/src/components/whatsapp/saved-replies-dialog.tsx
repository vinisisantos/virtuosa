"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  FileText,
  Loader2,
  MessageSquareText,
  Pencil,
  Plus,
  Save,
  Search,
  Trash2,
} from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { confirmDialog } from "@/components/ui/confirm-dialog";
import {
  SAVED_REPLY_CONTENT_MAX_LENGTH,
  SAVED_REPLY_MAX_PER_USER,
  SAVED_REPLY_TITLE_MAX_LENGTH,
} from "@/lib/whatsapp/saved-replies";
import type {
  SavedReply,
  WhatsAppSavedRepliesLibrary,
} from "@/hooks/use-whatsapp-saved-replies";

type Props = {
  open: boolean;
  draftText: string;
  library: WhatsAppSavedRepliesLibrary;
  onOpenChange: (open: boolean) => void;
  onSelect: (content: string) => void;
};

export function SavedRepliesDialog({ open, draftText, library, onOpenChange, onSelect }: Props) {
  const { replies, loading, load, save, remove } = library;
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [mode, setMode] = useState<"list" | "form">("list");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    void load()
      .catch((requestError) => {
        setError(requestError instanceof Error ? requestError.message : "Não foi possível carregar as respostas rápidas.");
      });
  }, [load, open]);

  useEffect(() => {
    if (open) return;
    setMode("list");
    setEditingId(null);
    setTitle("");
    setContent("");
    setError(null);
  }, [open]);

  const filteredReplies = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    if (!term) return replies;
    return replies.filter((reply) =>
      `${reply.title}\n${reply.content}`.toLocaleLowerCase("pt-BR").includes(term)
    );
  }, [replies, search]);

  const beginCreate = () => {
    setEditingId(null);
    setTitle("");
    setContent(draftText.trim().slice(0, SAVED_REPLY_CONTENT_MAX_LENGTH));
    setError(null);
    setMode("form");
  };

  const beginEdit = (reply: SavedReply) => {
    setEditingId(reply.id);
    setTitle(reply.title);
    setContent(reply.content);
    setError(null);
    setMode("form");
  };

  const saveReply = async () => {
    if (!title.trim() || !content.trim() || saving) return;

    setSaving(true);
    setError(null);
    try {
      await save({ id: editingId, title, content });
      setMode("list");
      setEditingId(null);
      setTitle("");
      setContent("");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Não foi possível salvar a resposta rápida.");
    } finally {
      setSaving(false);
    }
  };

  const deleteReply = async (reply: SavedReply) => {
    if (deletingId) return;
    const confirmed = await confirmDialog({
      title: "Excluir resposta rápida",
      message: `Excluir “${reply.title}”? Esta ação não pode ser desfeita.`,
      confirmText: "Excluir",
      cancelText: "Cancelar",
      variant: "danger",
    });
    if (!confirmed) return;

    setDeletingId(reply.id);
    setError(null);
    try {
      await remove(reply.id);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Não foi possível excluir a resposta rápida.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="border-b border-border px-4 pb-3 pt-4 pr-12 sm:px-5 sm:pt-5">
          <div className="flex items-start gap-3">
            {mode === "form" ? (
              <button
                type="button"
                onClick={() => { setMode("list"); setError(null); }}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground transition-colors hover:text-foreground"
                aria-label="Voltar para respostas rápidas"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
            ) : (
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <MessageSquareText className="h-5 w-5" />
              </div>
            )}
            <div className="min-w-0 pt-0.5">
              <DialogTitle>{mode === "form" ? (editingId ? "Editar resposta" : "Nova resposta") : "Respostas rápidas"}</DialogTitle>
              <DialogDescription className="mt-1">
                {mode === "form"
                  ? "Salve um texto para reutilizar em qualquer uma das suas instâncias."
                  : "Somente você pode ver e usar estas mensagens."}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {mode === "list" ? (
          <>
            <div className="flex items-center gap-2 border-b border-border px-4 py-3 sm:px-5">
              <div className="relative min-w-0 flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Buscar resposta"
                  className="h-11 w-full rounded-xl border border-input bg-background pl-9 pr-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-primary"
                />
              </div>
              <button
                type="button"
                onClick={beginCreate}
                disabled={replies.length >= SAVED_REPLY_MAX_PER_USER}
                aria-label="Nova resposta rápida"
                className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50 sm:px-4"
              >
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">Nova</span>
              </button>
            </div>

            <div className="min-h-[240px] flex-1 overflow-y-auto overscroll-contain px-3 py-3 sm:max-h-[56dvh] sm:px-4">
              {loading ? (
                <div className="flex min-h-[220px] items-center justify-center text-muted-foreground">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : filteredReplies.length > 0 ? (
                <div className="space-y-2">
                  {filteredReplies.map((reply) => (
                    <div key={reply.id} className="group flex items-stretch gap-1 rounded-xl border border-border bg-background p-1 transition-colors hover:border-primary/30 hover:bg-muted/40">
                      <button
                        type="button"
                        onClick={() => onSelect(reply.content)}
                        className="min-w-0 flex-1 rounded-lg px-3 py-2.5 text-left"
                      >
                        <span className="block truncate text-sm font-semibold text-foreground">{reply.title}</span>
                        <span className="mt-1 line-clamp-2 block whitespace-pre-line text-xs leading-5 text-muted-foreground">{reply.content}</span>
                      </button>
                      <div className="flex shrink-0 items-center gap-0.5 pr-1">
                        <button
                          type="button"
                          onClick={() => beginEdit(reply)}
                          className="flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                          aria-label={`Editar ${reply.title}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void deleteReply(reply)}
                          disabled={deletingId === reply.id}
                          className="flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                          aria-label={`Excluir ${reply.title}`}
                        >
                          {deletingId === reply.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex min-h-[220px] flex-col items-center justify-center px-5 text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <FileText className="h-6 w-6" />
                  </div>
                  <p className="mt-3 text-sm font-semibold text-foreground">
                    {search.trim() ? "Nenhuma resposta encontrada" : "Você ainda não salvou respostas"}
                  </p>
                  <p className="mt-1 max-w-xs text-xs leading-5 text-muted-foreground">
                    {search.trim()
                      ? "Tente buscar por outro nome ou trecho da mensagem."
                      : "Crie mensagens frequentes e insira no atendimento com um toque."}
                  </p>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-border bg-muted/30 px-4 py-3 text-[11px] text-muted-foreground sm:px-5">
              <span>{replies.length} de {SAVED_REPLY_MAX_PER_USER} salvas</span>
              <span>Toque para inserir no campo</span>
            </div>
          </>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
            <div className="space-y-4">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-3">
                  <label htmlFor="saved-reply-title" className="text-xs font-semibold text-foreground">Nome da resposta</label>
                  <span className="text-[11px] text-muted-foreground">{title.length}/{SAVED_REPLY_TITLE_MAX_LENGTH}</span>
                </div>
                <input
                  id="saved-reply-title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value.slice(0, SAVED_REPLY_TITLE_MAX_LENGTH))}
                  placeholder="Ex.: Endereço de Osasco"
                  autoFocus
                  className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-primary"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-3">
                  <label htmlFor="saved-reply-content" className="text-xs font-semibold text-foreground">Mensagem</label>
                  <span className="text-[11px] text-muted-foreground">{content.length}/{SAVED_REPLY_CONTENT_MAX_LENGTH}</span>
                </div>
                <textarea
                  id="saved-reply-content"
                  value={content}
                  onChange={(event) => setContent(event.target.value.slice(0, SAVED_REPLY_CONTENT_MAX_LENGTH))}
                  placeholder="Digite a mensagem que deseja reutilizar..."
                  rows={9}
                  className="max-h-[42dvh] min-h-44 w-full resize-y rounded-xl border border-input bg-background px-3 py-3 text-sm leading-6 text-foreground outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-primary"
                />
              </div>

              {error && (
                <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-xs text-destructive">
                  {error}
                </div>
              )}

              <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => { setMode("list"); setError(null); }}
                  disabled={saving}
                  className="inline-flex h-11 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => void saveReply()}
                  disabled={saving || !title.trim() || !content.trim()}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {saving ? "Salvando..." : "Salvar resposta"}
                </button>
              </div>
            </div>
          </div>
        )}

        {mode === "list" && error && (
          <div className="border-t border-destructive/20 bg-destructive/10 px-4 py-2.5 text-xs text-destructive sm:px-5">
            {error}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
