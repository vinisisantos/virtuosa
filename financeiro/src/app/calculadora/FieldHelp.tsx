'use client';

import { useId, useRef, useState } from 'react';
import { Popover } from '@base-ui/react/popover';

export function FieldHelp({ label, help, descriptionId }: { label: string; help: string; descriptionId?: string }) {
  const triggerId = useId();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const restoringFocus = useRef(false);
  return (
    <>
      {descriptionId && <span id={descriptionId} className="calc-sr-only">{help}</span>}
      <Popover.Root open={open} triggerId={triggerId} onOpenChange={(next, details) => {
        setOpen(next);
        if (!next && (details.reason === 'escape-key' || details.reason === 'close-press') && popupRef.current?.contains(document.activeElement)) {
          restoringFocus.current = true;
          triggerRef.current?.focus({ preventScroll: true });
          restoringFocus.current = false;
        }
      }}>
        <Popover.Trigger ref={triggerRef} id={triggerId} type="button" className="calc-help-trigger" aria-label={`Ajuda: ${label}`} openOnHover delay={150} closeDelay={150}
          onFocus={event => { if (!restoringFocus.current && event.currentTarget.matches(':focus-visible')) setOpen(true); }}>
          <span aria-hidden="true">?</span>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Positioner side="top" align="center" sideOffset={6} collisionPadding={12} className="calc-help-positioner">
            <Popover.Popup ref={popupRef} className="calc-help-popup" initialFocus={false} finalFocus={false}>
              <div className="calc-help-heading">
                <Popover.Title className="calc-help-title">{label}</Popover.Title>
                <Popover.Close type="button" className="calc-help-close" aria-label="Fechar explicação">×</Popover.Close>
              </div>
              <Popover.Description className="calc-help-description">{help}</Popover.Description>
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
    </>
  );
}
