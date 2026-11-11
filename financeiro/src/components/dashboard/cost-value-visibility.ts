'use client';

import { createContext, useContext } from 'react';
import { fmt } from '@/hooks/useDashboard';

export const CostValueVisibilityContext = createContext(false);

export function useCostValuesHidden() {
  return useContext(CostValueVisibilityContext);
}

export function useCostValueFormatter() {
  const valuesHidden = useCostValuesHidden();
  return (value: number) => valuesHidden ? 'R$ ••••••' : fmt(value);
}
