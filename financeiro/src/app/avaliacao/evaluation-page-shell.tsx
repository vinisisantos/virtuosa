'use client';

import { useEffect, type ReactNode } from 'react';

export function EvaluationPageShell({ children }: { children: ReactNode }) {
  useEffect(() => {
    document.body.classList.add('evaluation-landing-page');
    return () => document.body.classList.remove('evaluation-landing-page');
  }, []);

  return children;
}
