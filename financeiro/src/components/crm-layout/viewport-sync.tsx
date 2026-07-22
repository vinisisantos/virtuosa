"use client";

import { useEffect } from "react";

const KEYBOARD_MIN_REDUCTION_PX = 120;

function isEditableElement(element: Element | null) {
  return element instanceof HTMLInputElement
    || element instanceof HTMLTextAreaElement
    || (element instanceof HTMLElement && element.isContentEditable);
}

export function CrmViewportSync() {
  useEffect(() => {
    const root = document.documentElement;
    const viewport = window.visualViewport;
    let animationFrame = 0;
    let referenceHeight = viewport?.height ?? window.innerHeight;
    let referenceWidth = viewport?.width ?? window.innerWidth;

    document.body.classList.add("crm-shell-active");

    const syncViewport = () => {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(() => {
        const height = viewport?.height ?? window.innerHeight;
        const offsetTop = viewport?.offsetTop ?? 0;
        const width = viewport?.width ?? window.innerWidth;
        const editableFocused = isEditableElement(document.activeElement);

        if (Math.abs(width - referenceWidth) >= 80) {
          referenceHeight = height;
          referenceWidth = width;
        } else if (!editableFocused || height > referenceHeight) {
          referenceHeight = Math.max(referenceHeight, height);
        }

        const keyboardOpen = editableFocused
          && referenceHeight - height >= KEYBOARD_MIN_REDUCTION_PX;

        root.style.setProperty("--crm-visual-height", `${Math.round(height)}px`);
        root.style.setProperty("--crm-visual-offset-top", `${Math.max(0, Math.round(offsetTop))}px`);
        root.toggleAttribute("data-keyboard-open", keyboardOpen);
        window.dispatchEvent(new CustomEvent("crm:visual-viewport-change", {
          detail: { height, offsetTop, keyboardOpen },
        }));
      });
    };

    syncViewport();
    viewport?.addEventListener("resize", syncViewport);
    viewport?.addEventListener("scroll", syncViewport);
    window.addEventListener("resize", syncViewport);
    document.addEventListener("focusin", syncViewport);
    document.addEventListener("focusout", syncViewport);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      viewport?.removeEventListener("resize", syncViewport);
      viewport?.removeEventListener("scroll", syncViewport);
      window.removeEventListener("resize", syncViewport);
      document.removeEventListener("focusin", syncViewport);
      document.removeEventListener("focusout", syncViewport);
      root.style.removeProperty("--crm-visual-height");
      root.style.removeProperty("--crm-visual-offset-top");
      root.removeAttribute("data-keyboard-open");
      document.body.classList.remove("crm-shell-active");
    };
  }, []);

  return null;
}
