"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";

type NotificationMuteSnapshot = {
  mutedInstanceIds: readonly string[];
  savingInstanceIds: readonly string[];
  loaded: boolean;
};

const initialSnapshot: NotificationMuteSnapshot = {
  mutedInstanceIds: [],
  savingInstanceIds: [],
  loaded: false,
};

let snapshot = initialSnapshot;
let loadPromise: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit(next: NotificationMuteSnapshot) {
  snapshot = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return snapshot;
}

function getServerSnapshot() {
  return initialSnapshot;
}

function uniqueIds(values: unknown) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.filter((value): value is string => typeof value === "string" && value.length > 0))];
}

async function loadNotificationMutes() {
  if (snapshot.loaded) return;
  if (loadPromise) return loadPromise;

  loadPromise = fetch("/api/whatsapp/notification-preferences", { credentials: "include" })
    .then(async (response) => {
      if (!response.ok) throw new Error("Não foi possível carregar as preferências de notificação");
      const data = await response.json();
      const savingIds = new Set(snapshot.savingInstanceIds);
      const serverIds = uniqueIds(data.mutedInstanceIds).filter((id) => !savingIds.has(id));
      const optimisticSavingIds = snapshot.mutedInstanceIds.filter((id) => savingIds.has(id));
      emit({
        ...snapshot,
        mutedInstanceIds: uniqueIds([...serverIds, ...optimisticSavingIds]),
        loaded: true,
      });
    })
    .catch(() => {
      emit({ ...snapshot, loaded: true });
    })
    .finally(() => {
      loadPromise = null;
    });

  return loadPromise;
}

export function useWhatsAppInstanceNotificationMutes() {
  const current = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    void loadNotificationMutes();
  }, []);

  const setInstanceMuted = useCallback(async (instanceId: string, muted: boolean) => {
    if (snapshot.savingInstanceIds.includes(instanceId)) return;

    const wasMuted = snapshot.mutedInstanceIds.includes(instanceId);
    const previousMutedIds = snapshot.mutedInstanceIds;
    const optimisticMutedIds = muted
      ? uniqueIds([...previousMutedIds, instanceId])
      : previousMutedIds.filter((id) => id !== instanceId);

    emit({
      ...snapshot,
      mutedInstanceIds: optimisticMutedIds,
      savingInstanceIds: [...snapshot.savingInstanceIds, instanceId],
    });

    try {
      const response = await fetch("/api/whatsapp/notification-preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ instanceId, muted }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error || "Não foi possível salvar a preferência");
      }

      emit({
        ...snapshot,
        savingInstanceIds: snapshot.savingInstanceIds.filter((id) => id !== instanceId),
      });
    } catch (error) {
      const rolledBackMutedIds = wasMuted
        ? uniqueIds([...snapshot.mutedInstanceIds, instanceId])
        : snapshot.mutedInstanceIds.filter((id) => id !== instanceId);
      emit({
        ...snapshot,
        mutedInstanceIds: rolledBackMutedIds,
        savingInstanceIds: snapshot.savingInstanceIds.filter((id) => id !== instanceId),
      });
      throw error;
    }
  }, []);

  return {
    ...current,
    setInstanceMuted,
  };
}
