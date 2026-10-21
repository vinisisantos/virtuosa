"use client";

import { useEffect, useState } from 'react';
import type { CatalogService } from '@/components/procedure-selector';

export function useServiceCatalog(unit: string, enabled = true) {
  const [result, setResult] = useState<{
    unit: string; services: CatalogService[]; loading: boolean; error: boolean;
  }>({ unit: '', services: [], loading: true, error: false });

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const url = `/api/catalog?unit=${encodeURIComponent(unit || 'Todas')}`;
    fetch(url, { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error('Catálogo indisponível');
        const data = await response.json();
        if (!controller.signal.aborted) {
          setResult({ unit, services: data.services || [], loading: false, error: false });
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setResult({ unit, services: [], loading: false, error: true });
      });
    return () => controller.abort();
  }, [unit, enabled]);

  // Never offer options from the previous unit while its replacement is loading.
  if (!enabled || result.unit !== unit) return { services: [], loading: enabled, error: false };
  return result;
}
