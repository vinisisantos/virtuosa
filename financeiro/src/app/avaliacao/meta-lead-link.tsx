'use client';

import type { ReactNode } from 'react';

type MetaLeadLinkProps = {
  children: ReactNode;
  className: string;
  href: string;
  trackLead: boolean;
};

export function MetaLeadLink({ children, className, href, trackLead }: MetaLeadLinkProps) {
  const trackMetaLead = () => {
    if (!trackLead) return;
    const fbq = (window as Window & { fbq?: (...args: unknown[]) => void }).fbq;
    fbq?.('track', 'Lead');
  };

  return (
    <a
      className={className}
      href={href}
      target="_blank"
      rel="noreferrer"
      onClick={trackMetaLead}
    >
      {children}
    </a>
  );
}
