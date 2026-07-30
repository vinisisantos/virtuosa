"use client";

import { useCallback, useRef, useState } from "react";

export type SavedReply = {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
};

type SavedReplyInput = {
  id?: string | null;
  title: string;
  content: string;
};

async function readResponse(response: Response) {
  return response.json().catch(() => ({}));
}

export function useWhatsAppSavedReplies() {
  const [replies, setReplies] = useState<SavedReply[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
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
        const nextReplies = Array.isArray(data.replies) ? data.replies as SavedReply[] : [];
        setReplies(nextReplies);
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

  const save = useCallback(async ({ id, title, content }: SavedReplyInput) => {
    const endpoint = id
      ? `/api/whatsapp/saved-replies/${id}`
      : "/api/whatsapp/saved-replies";
    const response = await fetch(endpoint, {
      method: id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, content }),
    });
    const data = await readResponse(response);
    if (!response.ok || !data.reply) {
      throw new Error(data.error || "Não foi possível salvar a resposta rápida.");
    }

    const reply = data.reply as SavedReply;
    setReplies((current) => {
      const nextReplies = [reply, ...current.filter((item) => item.id !== reply.id)];
      repliesRef.current = nextReplies;
      return nextReplies;
    });
    return reply;
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

  return { replies, loaded, loading, load, save, remove };
}

export type WhatsAppSavedRepliesLibrary = ReturnType<typeof useWhatsAppSavedReplies>;
