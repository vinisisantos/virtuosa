'use client';

import { useEffect, type ReactNode } from 'react';

// O body global é travado em altura e tema escuro para o app; a página pública precisa rolar e manter o fundo claro.
export function ProductPageShell({ children }: { children: ReactNode }) {
  useEffect(() => {
    document.body.classList.add('product-landing-page');
    return () => document.body.classList.remove('product-landing-page');
  }, []);

  return children;
}
