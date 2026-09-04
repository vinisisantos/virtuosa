"use client";

import { useCallback, useRef, useState } from "react";

export type SavedReply = {
  id: string;
  categoryId: string | null;
  title: string;
  content: string;
  position: number;
  createdAt: string;
  updatedAt: string;
};

export type SavedReplyCategory = {
  id: string;
  title: string;
  campaignName: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SavedReplyCampaignOption = {
  name: string;
  units: string[];
};

type SavedReplyInput = {
  id?: string | null;
  title: string;
  content: string;
  categoryId?: string | null;
};

type SavedReplyCategoryInput = {
  id?: string | null;
  title: string;
  campaignName?: string | null;
};

async function readResponse(response: Response) {
  return response.json().catch(() => ({}));
}

function sortRepliesByPosition(replies: SavedReply[]) {
  return [...replies].sort((left, right) => (
    left.position - right.position
    || Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
    || right.id.localeCompare(left.id)
  ));
}

export function useWhatsAppSavedReplies() {
  const [replies, setReplies] = useState<SavedReply[]>([]);
  const [categories, setCategories] = useState<SavedReplyCategory[]>([]);
  const [campaignOptions, setCampaignOptions] = useState<SavedReplyCampaignOption[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [reordering, setReordering] = useState(false);
  const loadedRef = useRef(false);
  const repliesRef = useRef<SavedReply[]>([]);
  const loadPromiseRef = useRef<Promise<SavedReply[]> | null>(null);

  const load = useCallback(async () => {
    if (loadedRef.current) return repliesRef.current;
    if (loadPromiseRef.current) return loadPromiseRef.current;

    setLoading(true);
    const request = fetch("/api/whatsapp/saved-replies", { cache: "no-store" })
      .then(async (response) => {
        const data = await readResponse(response);
        if (!response.ok) throw new Error(data.error || "Não foi possível carregar as respostas rápidas.");
        const nextReplies = sortRepliesByPosition(Array.isArray(data.replies) ? data.replies as SavedReply[] : []);
        const nextCategories = Array.isArray(data.categories) ? data.categories as SavedReplyCategory[] : [];
        const nextCampaignOptions = Array.isArray(data.campaignOptions)
          ? data.campaignOptions as SavedReplyCampaignOption[]
          : [];
        setReplies(nextReplies);
        setCategories(nextCategories);
        setCampaignOptions(nextCampaignOptions);
        repliesRef.current = nextReplies;
        setLoaded(true);
        loadedRef.current = true;
        return nextReplies;
      })
      .finally(() => {
        setLoading(false);
        loadPromiseRef.current = null;
      });

    loadPromiseRef.current = request;
    return request;
  }, []);

  const save = useCallback(async ({ id, title, content, categoryId }: SavedReplyInput) => {
    const endpoint = id
      ? `/api/whatsapp/saved-replies/${id}`
      : "/api/whatsapp/saved-replies";
    const response = await fetch(endpoint, {
      method: id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, content, categoryId: categoryId || null }),
    });
    const data = await readResponse(response);
    if (!response.ok || !data.reply) {
      throw new Error(data.error || "Não foi possível salvar a resposta rápida.");
    }

    const reply = data.reply as SavedReply;
    setReplies((current) => {
      const nextReplies = sortRepliesByPosition([
        ...current.filter((item) => item.id !== reply.id),
        reply,
      ]);
      repliesRef.current = nextReplies;
      return nextReplies;
    });
    return reply;
  }, []);

  const saveCategory = useCallback(async ({ id, title, campaignName }: SavedReplyCategoryInput) => {
    const endpoint = id
      ? `/api/whatsapp/saved-replies/categories/${id}`
      : "/api/whatsapp/saved-replies/categories";
    const response = await fetch(endpoint, {
      method: id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, campaignName: campaignName || null }),
    });
    const data = await readResponse(response);
    if (!response.ok || !data.category) {
      throw new Error(data.error || "Não foi possível salvar a categoria.");
    }

    const category = data.category as SavedReplyCategory;
    setCategories((current) => {
      const nextCategories = [category, ...current.filter((item) => item.id !== category.id)]
        .sort((left, right) => left.title.localeCompare(right.title, "pt-BR"));
      return nextCategories;
    });
    return category;
  }, []);

  const removeCategory = useCallback(async (id: string) => {
    const response = await fetch(`/api/whatsapp/saved-replies/categories/${id}`, { method: "DELETE" });
    const data = await readResponse(response);
    if (!response.ok) throw new Error(data.error || "Não foi possível excluir a categoria.");

    setCategories((current) => {
      const nextCategories = current.filter((item) => item.id !== id);
      return nextCategories;
    });
    setReplies((current) => {
      const nextReplies = current.map((item) => item.categoryId === id ? { ...item, categoryId: null } : item);
      repliesRef.current = nextReplies;
      return nextReplies;
    });
  }, []);

  const remove = useCallback(async (id: string) => {
    const response = await fetch(`/api/whatsapp/saved-replies/${id}`, { method: "DELETE" });
    const data = await readResponse(response);
    if (!response.ok) throw new Error(data.error || "Não foi possível excluir a resposta rápida.");
    setReplies((current) => {
      const nextReplies = current.filter((item) => item.id !== id);
      repliesRef.current = nextReplies;
      return nextReplies;
    });
  }, []);

  const reorder = useCallback(async (orderedIds: string[]) => {
    const previousReplies = repliesRef.current;
    const replyById = new Map(previousReplies.map((reply) => [reply.id, reply]));
    if (orderedIds.length !== previousReplies.length || orderedIds.some((id) => !replyById.has(id))) {
      throw new Error("A lista de respostas mudou. Reabra a biblioteca e tente novamente.");
    }

    const nextReplies = orderedIds.map((id, position) => ({
      ...replyById.get(id)!,
      position,
    }));
    repliesRef.current = nextReplies;
    setReplies(nextReplies);
    setReordering(true);

    try {
      const response = await fetch("/api/whatsapp/saved-replies/reorder", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: orderedIds }),
      });
      const data = await readResponse(response);
      if (!response.ok) throw new Error(data.error || "Não foi possível salvar a ordem das respostas rápidas.");
    } catch (error) {
      repliesRef.current = previousReplies;
      setReplies(previousReplies);
      throw error;
    } finally {
      setReordering(false);
    }
  }, []);

  return {
    replies,
    categories,
    campaignOptions,
    loaded,
    loading,
    reordering,
    load,
    save,
    remove,
    saveCategory,
    removeCategory,
    reorder,
  };
}

export type WhatsAppSavedRepliesLibrary = ReturnType<typeof useWhatsAppSavedReplies>;
