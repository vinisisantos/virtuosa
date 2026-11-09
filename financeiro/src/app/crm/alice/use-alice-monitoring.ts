"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AliceMonitoringData } from "./monitoring-types";

const ENDPOINT = "/api/crm/ai-assistant/autonomy";
const ACCESS_ERROR = "Seu acesso não permite acompanhar a Alice em SBC. Solicite a revisão da permissão à administração.";

export function useAliceMonitoring(days: number) {
  const [data, setData] = useState<AliceMonitoringData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const moreControllerRef = useRef<AbortController | null>(null);
  const versionRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      controllerRef.current?.abort();
      moreControllerRef.current?.abort();
    };
  }, []);

  const load = useCallback(async () => {
    controllerRef.current?.abort();
    moreControllerRef.current?.abort();
    versionRef.current += 1;
    setLoadingMore(false);
    const controller = new AbortController();
    controllerRef.current = controller;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${ENDPOINT}?days=${days}`, { cache: "no-store", signal: controller.signal });
      const result = await response.json().catch(() => ({}));
      if (controller.signal.aborted || !mountedRef.current) return;
      if (response.status === 401 || response.status === 403) {
        setData(null);
        throw new Error(ACCESS_ERROR);
      }
      if (!response.ok) throw new Error(result.error || "Não foi possível carregar o acompanhamento. Tente novamente.");
      if (!result.config || !result.readiness || !result.summary || !Array.isArray(result.items) || !Array.isArray(result.backlogCandidates)) {
        throw new Error("O acompanhamento retornou dados incompletos. Atualize para tentar novamente.");
      }
      setData(result);
      setLastUpdatedAt(new Date().toISOString());
    } catch (cause) {
      if (!controller.signal.aborted && mountedRef.current) {
        setError(cause instanceof Error ? cause.message : "Não foi possível carregar o acompanhamento.");
      }
    } finally {
      if (!controller.signal.aborted && mountedRef.current) setLoading(false);
    }
  }, [days]);

  useEffect(() => { void load(); }, [load]);

  const loadMore = async () => {
    if (!data?.nextCursor || loadingMore || loading || saving) return;
    const controller = new AbortController();
    moreControllerRef.current = controller;
    const version = versionRef.current;
    setLoadingMore(true);
    setError(null);
    try {
      const query = new URLSearchParams({ days: String(days), cursor: data.nextCursor });
      const response = await fetch(`${ENDPOINT}?${query}`, { cache: "no-store", signal: controller.signal });
      const result = await response.json().catch(() => ({}));
      if (controller.signal.aborted || !mountedRef.current || versionRef.current !== version) return;
      if (response.status === 401 || response.status === 403) {
        setData(null);
        throw new Error(ACCESS_ERROR);
      }
      if (!response.ok || !Array.isArray(result.items)) throw new Error(result.error || "Não foi possível carregar os próximos registros. Tente novamente.");
      setData((current) => {
        if (!current) return current;
        const ids = new Set(current.items.map((item) => item.id));
        return { ...current, items: [...current.items, ...result.items.filter((item: AliceMonitoringData["items"][number]) => !ids.has(item.id))], nextCursor: result.nextCursor || null };
      });
    } catch (cause) {
      if (!controller.signal.aborted && mountedRef.current && versionRef.current === version) {
        setError(cause instanceof Error ? cause.message : "Não foi possível carregar os próximos registros.");
      }
    } finally {
      if (!controller.signal.aborted && mountedRef.current && versionRef.current === version) setLoadingMore(false);
    }
  };

  const changeEnabled = async (enabled: boolean, backlogAnchorConversationId?: string, backlogPreviewToken?: string) => {
    if (saving) return false;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(ENDPOINT, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled, ...(backlogAnchorConversationId ? { backlogAnchorConversationId, backlogPreviewToken } : {}) }),
      });
      const result = await response.json().catch(() => ({}));
      if (response.status === 401 || response.status === 403) {
        if (mountedRef.current) setData(null);
        throw new Error(ACCESS_ERROR);
      }
      if (!response.ok) throw new Error(result.error || "Não foi possível alterar o atendimento autônomo.");
      if (mountedRef.current) {
        setData((current) => current ? { ...current, config: { ...current.config, enabled } } : current);
        await load();
      }
      return true;
    } catch (cause) {
      if (mountedRef.current) setError(cause instanceof Error ? cause.message : "Não foi possível alterar o atendimento autônomo.");
      return false;
    } finally {
      if (mountedRef.current) setSaving(false);
    }
  };

  return { data, loading, loadingMore, saving, error, lastUpdatedAt, load, loadMore, changeEnabled };
}
