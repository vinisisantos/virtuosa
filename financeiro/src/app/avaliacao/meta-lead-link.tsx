import type { ReactNode } from 'react';

type MetaLeadLinkProps = {
  children: ReactNode;
  className: string;
  href: string;
  trackLead: boolean;
};

export function MetaLeadLink({ children, className, href, trackLead }: MetaLeadLinkProps) {
  return (
    <>
      <a
        className={className}
        href={href}
        target="_blank"
        rel="noreferrer"
        data-meta-event={trackLead ? 'Lead' : undefined}
      >
        {children}
      </a>
      {trackLead ? (
        <script
          id="meta-lead-event"
          dangerouslySetInnerHTML={{
            __html: `
document.addEventListener('click', function(event) {
  var target = event.target instanceof Element
    ? event.target.closest('[data-meta-event="Lead"]')
    : null;
  if (!target || typeof fbq !== 'function') return;
  fbq('track', 'Lead');
});
`,
          }}
        />
      ) : null}
    </>
  );
}
