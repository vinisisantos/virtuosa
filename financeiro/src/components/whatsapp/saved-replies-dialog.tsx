"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  FolderCog,
  FolderPlus,
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
  SAVED_REPLY_CATEGORY_MAX_PER_USER,
  SAVED_REPLY_CATEGORY_TITLE_MAX_LENGTH,
  SAVED_REPLY_MAX_PER_USER,
  SAVED_REPLY_TITLE_MAX_LENGTH,
} from "@/lib/whatsapp/saved-replies";
import type {
  SavedReply,
  SavedReplyCategory,
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
  const {
    replies,
    categories,
    loading,
    load,
    save,
    remove,
    saveCategory,
    removeCategory,
  } = library;
  const [saving, setSaving] = useState(false);
  const [savingCategory, setSavingCategory] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletingCategoryId, setDeletingCategoryId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [mode, setMode] = useState<"list" | "form" | "categories">("list");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [categoryTitle, setCategoryTitle] = useState("");
  const [collapsedCategoryIds, setCollapsedCategoryIds] = useState<Set<string>>(new Set());
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
    setCategoryId(null);
    setEditingCategoryId(null);
    setCategoryTitle("");
    setError(null);
  }, [open]);

  const categoryTitleById = useMemo(
    () => new Map(categories.map((category) => [category.id, category.title])),
    [categories],
  );

  const filteredReplies = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    if (!term) return replies;
    return replies.filter((reply) => {
      const categoryTitle = reply.categoryId ? categoryTitleById.get(reply.categoryId) || "" : "Sem categoria";
      return `${categoryTitle}\n${reply.title}\n${reply.content}`.toLocaleLowerCase("pt-BR").includes(term);
    });
  }, [categoryTitleById, replies, search]);

  const groupedReplies = useMemo(() => {
    const groups: Array<{ id: string; title: string; category: SavedReplyCategory | null; replies: SavedReply[] }> = categories.map((category) => ({
      id: category.id,
      title: category.title,
      category,
      replies: filteredReplies.filter((reply) => reply.categoryId === category.id),
    }));
    const uncategorizedReplies = filteredReplies.filter((reply) => !reply.categoryId || !categoryTitleById.has(reply.categoryId));
    if (uncategorizedReplies.length > 0 || categories.length === 0) {
      groups.push({ id: "uncategorized", title: "Sem categoria", category: null, replies: uncategorizedReplies });
    }

    const term = search.trim().toLocaleLowerCase("pt-BR");
    if (!term) return groups;
    return groups.filter((group) => group.title.toLocaleLowerCase("pt-BR").includes(term) || group.replies.length > 0);
  }, [categories, categoryTitleById, filteredReplies, search]);

  const beginCreate = (nextCategoryId: string | null = null) => {
    setEditingId(null);
    setTitle("");
    setContent(draftText.trim().slice(0, SAVED_REPLY_CONTENT_MAX_LENGTH));
    setCategoryId(nextCategoryId);
    setError(null);
    setMode("form");
  };

  const beginEdit = (reply: SavedReply) => {
    setEditingId(reply.id);
    setTitle(reply.title);
    setContent(reply.content);
    setCategoryId(reply.categoryId);
    setError(null);
    setMode("form");
  };

  const saveReply = async () => {
    if (!title.trim() || !content.trim() || saving) return;

    setSaving(true);
    setError(null);
    try {
      await save({ id: editingId, title, content, categoryId });
      setMode("list");
      setEditingId(null);
      setTitle("");
      setContent("");
      setCategoryId(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Não foi possível salvar a resposta rápida.");
    } finally {
      setSaving(false);
    }
  };

  const saveReplyCategory = async () => {
    if (!categoryTitle.trim() || savingCategory) return;
    setSavingCategory(true);
    setError(null);
    try {
      await saveCategory({ id: editingCategoryId, title: categoryTitle });
      setEditingCategoryId(null);
      setCategoryTitle("");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Não foi possível salvar a categoria.");
    } finally {
      setSavingCategory(false);
    }
  };

  const beginEditCategory = (category: SavedReplyCategory) => {
    setEditingCategoryId(category.id);
    setCategoryTitle(category.title);
    setError(null);
  };

  const deleteCategory = async (category: SavedReplyCategory) => {
    if (deletingCategoryId) return;
    const confirmed = await confirmDialog({
      title: "Excluir categoria",
      message: `Excluir “${category.title}”? As respostas serão preservadas em “Sem categoria”.`,
      confirmText: "Excluir",
      cancelText: "Cancelar",
      variant: "danger",
    });
    if (!confirmed) return;

    setDeletingCategoryId(category.id);
    setError(null);
    try {
      await removeCategory(category.id);
      if (editingCategoryId === category.id) {
        setEditingCategoryId(null);
        setCategoryTitle("");
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Não foi possível excluir a categoria.");
    } finally {
      setDeletingCategoryId(null);
    }
  };

  const toggleCategory = (id: string) => {
    setCollapsedCategoryIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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
            {mode !== "list" ? (
              <button
                type="button"
                onClick={() => {
                  setMode("list");
                  setEditingCategoryId(null);
                  setCategoryTitle("");
                  setError(null);
                }}
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
              <DialogTitle>
                {mode === "form"
                  ? (editingId ? "Editar resposta" : "Nova resposta")
                  : mode === "categories"
                    ? "Gerenciar categorias"
                    : "Respostas rápidas"}
              </DialogTitle>
              <DialogDescription className="mt-1">
                {mode === "form"
                  ? "Salve um texto para reutilizar em qualquer uma das suas instâncias."
                  : mode === "categories"
                    ? "Crie grupos para organizar sua biblioteca pessoal."
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
                onClick={() => {
                  setMode("categories");
                  setEditingCategoryId(null);
                  setCategoryTitle("");
                  setError(null);
                }}
                aria-label="Gerenciar categorias"
                className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-border bg-background px-3 text-sm font-semibold text-foreground transition-colors hover:border-primary/40 hover:bg-primary/10 hover:text-primary"
              >
                <FolderCog className="h-4 w-4" />
                <span className="hidden md:inline">Categorias</span>
              </button>
              <button
                type="button"
                onClick={() => beginCreate()}
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
              ) : groupedReplies.length > 0 ? (
                <div className="space-y-3">
                  {groupedReplies.map((group) => {
                    const collapsed = collapsedCategoryIds.has(group.id);
                    return (
                      <section key={group.id} className="overflow-hidden rounded-2xl border border-border bg-muted/20">
                        <div className="flex min-h-12 items-center gap-1 border-b border-border/70 bg-muted/40 px-2 py-1.5">
                          <button
                            type="button"
                            onClick={() => toggleCategory(group.id)}
                            className="flex min-w-0 flex-1 items-center gap-2 rounded-xl px-2 py-2 text-left transition-colors hover:bg-background/70"
                            aria-expanded={!collapsed}
                          >
                            {collapsed ? <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />}
                            <Folder className="h-4 w-4 shrink-0 text-primary" />
                            <span className="truncate text-xs font-bold uppercase tracking-wide text-foreground">{group.title}</span>
                            <span className="ml-auto shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">{group.replies.length}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => beginCreate(group.category?.id || null)}
                            disabled={replies.length >= SAVED_REPLY_MAX_PER_USER}
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary disabled:opacity-40"
                            aria-label={`Adicionar resposta em ${group.title}`}
                          >
                            <Plus className="h-4 w-4" />
                          </button>
                        </div>

                        {!collapsed && (
                          <div className="space-y-2 p-2">
                            {group.replies.length > 0 ? group.replies.map((reply) => (
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
                            )) : (
                              <div className="flex min-h-20 items-center justify-center px-4 text-center text-xs text-muted-foreground">
                                Nenhuma resposta nesta categoria.
                              </div>
                            )}
                          </div>
                        )}
                      </section>
                    );
                  })}
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
              <span>{replies.length}/{SAVED_REPLY_MAX_PER_USER} respostas · {categories.length}/{SAVED_REPLY_CATEGORY_MAX_PER_USER} categorias</span>
              <span className="hidden sm:inline">Toque para inserir no campo</span>
            </div>
          </>
        ) : mode === "form" ? (
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
                <label htmlFor="saved-reply-category" className="text-xs font-semibold text-foreground">Categoria</label>
                <select
                  id="saved-reply-category"
                  value={categoryId || ""}
                  onChange={(event) => setCategoryId(event.target.value || null)}
                  className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="">Sem categoria</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>{category.title}</option>
                  ))}
                </select>
                <p className="text-[11px] leading-4 text-muted-foreground">A categoria aparece apenas na sua biblioteca de respostas rápidas.</p>
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
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
            <div className="space-y-4">
              <div className="rounded-2xl border border-border bg-muted/30 p-3 sm:p-4">
                <div className="flex items-center justify-between gap-3">
                  <label htmlFor="saved-reply-category-title" className="text-xs font-semibold text-foreground">
                    {editingCategoryId ? "Editar categoria" : "Nova categoria"}
                  </label>
                  <span className="text-[11px] text-muted-foreground">{categoryTitle.length}/{SAVED_REPLY_CATEGORY_TITLE_MAX_LENGTH}</span>
                </div>
                <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                  <input
                    id="saved-reply-category-title"
                    value={categoryTitle}
                    onChange={(event) => setCategoryTitle(event.target.value.slice(0, SAVED_REPLY_CATEGORY_TITLE_MAX_LENGTH))}
                    placeholder="Ex.: Glúteos Perfeito"
                    autoFocus
                    className="h-11 min-w-0 flex-1 rounded-xl border border-input bg-background px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-primary"
                  />
                  <button
                    type="button"
                    onClick={() => void saveReplyCategory()}
                    disabled={savingCategory || !categoryTitle.trim() || (!editingCategoryId && categories.length >= SAVED_REPLY_CATEGORY_MAX_PER_USER)}
                    className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    {savingCategory ? <Loader2 className="h-4 w-4 animate-spin" /> : editingCategoryId ? <Save className="h-4 w-4" /> : <FolderPlus className="h-4 w-4" />}
                    {savingCategory ? "Salvando..." : editingCategoryId ? "Salvar" : "Criar"}
                  </button>
                </div>
                {editingCategoryId && (
                  <button
                    type="button"
                    onClick={() => { setEditingCategoryId(null); setCategoryTitle(""); setError(null); }}
                    className="mt-2 text-xs font-medium text-muted-foreground hover:text-foreground"
                  >
                    Cancelar edição
                  </button>
                )}
              </div>

              {error && (
                <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-xs text-destructive">
                  {error}
                </div>
              )}

              <div className="space-y-2">
                {categories.length > 0 ? categories.map((category) => {
                  const replyCount = replies.filter((reply) => reply.categoryId === category.id).length;
                  return (
                    <div key={category.id} className="flex min-h-14 items-center gap-2 rounded-xl border border-border bg-background p-2 pl-3">
                      <Folder className="h-4 w-4 shrink-0 text-primary" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-foreground">{category.title}</p>
                        <p className="text-[11px] text-muted-foreground">{replyCount} {replyCount === 1 ? "resposta" : "respostas"}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => beginEditCategory(category)}
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                        aria-label={`Editar categoria ${category.title}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void deleteCategory(category)}
                        disabled={deletingCategoryId === category.id}
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                        aria-label={`Excluir categoria ${category.title}`}
                      >
                        {deletingCategoryId === category.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                      </button>
                    </div>
                  );
                }) : (
                  <div className="flex min-h-[180px] flex-col items-center justify-center rounded-2xl border border-dashed border-border px-5 text-center">
                    <FolderCog className="h-7 w-7 text-primary" />
                    <p className="mt-3 text-sm font-semibold text-foreground">Nenhuma categoria criada</p>
                    <p className="mt-1 max-w-xs text-xs leading-5 text-muted-foreground">Suas respostas atuais continuam disponíveis em “Sem categoria”.</p>
                  </div>
                )}
              </div>

              <p className="rounded-xl bg-muted/40 px-3 py-2.5 text-[11px] leading-5 text-muted-foreground">
                Ao excluir uma categoria, suas respostas não são apagadas: elas voltam para “Sem categoria”.
              </p>
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
