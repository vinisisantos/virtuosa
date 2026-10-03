'use client';

import { useEffect, useState } from 'react';
import { toast } from '@/components/toast';

export type OrdersViewMode = 'detailed' | 'compact';

function isViewMode(value: unknown): value is OrdersViewMode {
  return value === 'detailed' || value === 'compact';
}

export function useOrdersViewPreference() {
  const [viewMode, setViewMode] = useState<OrdersViewMode>('detailed');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    fetch('/api/orders/view-preference', { credentials: 'include' })
      .then(async response => {
        if (!response.ok) throw new Error('Não foi possível carregar sua visualização de Pedidos.');
        return response.json();
      })
      .then(data => { if (active && isViewMode(data.view)) setViewMode(data.view); })
      .catch(error => { if (active) toast(error.message, 'error'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const changeView = async (nextView: OrdersViewMode) => {
    if (saving || loading || nextView === viewMode) return;
    const previousView = viewMode;
    setViewMode(nextView);
    setSaving(true);
    try {
      const response = await fetch('/api/orders/view-preference', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ view: nextView }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || 'Não foi possível salvar sua visualização de Pedidos.');
      }
    } catch (error) {
      setViewMode(previousView);
      toast(error instanceof Error ? error.message : 'Não foi possível salvar sua visualização de Pedidos.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return { viewMode, loading, saving, changeView };
}
