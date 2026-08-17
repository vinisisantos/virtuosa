"use client";

import {
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { SmilePlus, X } from "lucide-react";

import { WHATSAPP_EMOJI_CATEGORIES } from "@/components/whatsapp/emoji-picker";

const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"] as const;

type Props = {
  open: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  currentReaction?: string | null;
  onClose: () => void;
  onSelect: (reaction: string) => void;
};

export function ReactionPicker({ open, anchorRef, currentReaction, onClose, onSelect }: Props) {
  const popupRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [position, setPosition] = useState({ top: -9999, left: -9999, ready: false });
  const allEmojis = useMemo(() => (
    [...new Set(WHATSAPP_EMOJI_CATEGORIES.flatMap((category) => category.emojis))]
  ), []);

  const updatePosition = useCallback(() => {
    const anchor = anchorRef.current;
    const popup = popupRef.current;
    if (!anchor || !popup) return;

    const bounds = anchor.getBoundingClientRect();
    const visualViewport = window.visualViewport;
    const viewportLeft = visualViewport?.offsetLeft || 0;
    const viewportTop = visualViewport?.offsetTop || 0;
    const viewportWidth = visualViewport?.width || window.innerWidth;
    const viewportHeight = visualViewport?.height || window.innerHeight;
    const viewportRight = viewportLeft + viewportWidth;
    const viewportBottom = viewportTop + viewportHeight;
    const popupWidth = popup.offsetWidth;
    const popupHeight = popup.offsetHeight;
    const gap = 8;
    const margin = 8;
    const fitsBelow = bounds.bottom + gap + popupHeight <= viewportBottom - margin;
    const top = fitsBelow
      ? bounds.bottom + gap
      : Math.max(viewportTop + margin, bounds.top - popupHeight - gap);
    const centeredLeft = bounds.left + bounds.width / 2 - popupWidth / 2;
    const left = Math.min(
      Math.max(viewportLeft + margin, centeredLeft),
      Math.max(viewportLeft + margin, viewportRight - popupWidth - margin),
    );

    setPosition({ top, left, ready: true });
  }, [anchorRef]);

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
  }, [expanded, open, updatePosition]);

  useEffect(() => {
    if (!open) return;

    const handleOutside = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node;
      if (!popupRef.current?.contains(target) && !anchorRef.current?.contains(target)) {
        onClose();
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const visualViewport = window.visualViewport;

    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("touchstart", handleOutside);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    visualViewport?.addEventListener("resize", updatePosition);
    visualViewport?.addEventListener("scroll", updatePosition);

    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("touchstart", handleOutside);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      visualViewport?.removeEventListener("resize", updatePosition);
      visualViewport?.removeEventListener("scroll", updatePosition);
    };
  }, [anchorRef, onClose, open, updatePosition]);

  if (!open || typeof document === "undefined") return null;

  const selectReaction = (reaction: string) => {
    onSelect(reaction === currentReaction ? "" : reaction);
    onClose();
  };

  return createPortal(
    <div
      ref={popupRef}
      role="dialog"
      aria-label="Reagir à mensagem"
      style={{
        position: "fixed",
        top: position.top,
        left: position.left,
        visibility: position.ready ? "visible" : "hidden",
      }}
      className="z-[110] w-[min(22rem,calc(100vw-1rem))] overflow-hidden rounded-2xl border border-border bg-popover text-popover-foreground shadow-2xl"
    >
      <div className="flex items-center gap-1 p-1.5">
        {QUICK_REACTIONS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            onClick={() => selectReaction(emoji)}
            className={`flex h-11 min-w-0 flex-1 items-center justify-center rounded-xl text-[22px] transition-transform hover:bg-muted active:scale-90 ${
              currentReaction === emoji ? "bg-primary/15 ring-1 ring-inset ring-primary/50" : ""
            }`}
            aria-label={currentReaction === emoji ? `Remover reação ${emoji}` : `Reagir com ${emoji}`}
          >
            {emoji}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setExpanded((current) => !current)}
          className={`flex h-11 min-w-11 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground ${
            expanded ? "bg-muted text-foreground" : ""
          }`}
          aria-label={expanded ? "Ocultar outros emojis" : "Mostrar outros emojis"}
          aria-expanded={expanded}
        >
          <SmilePlus className="h-5 w-5" />
        </button>
      </div>

      {expanded && (
        <div className="border-t border-border">
          <div className="flex min-h-10 items-center justify-between px-3">
            <span className="text-xs font-semibold">Todos os emojis</span>
            <button
              type="button"
              onClick={onClose}
              className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Fechar reações"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="grid max-h-[min(38dvh,260px)] grid-cols-8 gap-0.5 overflow-y-auto overscroll-contain p-2">
            {allEmojis.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => selectReaction(emoji)}
                className={`flex aspect-square min-h-10 items-center justify-center rounded-lg text-[22px] transition-transform hover:bg-muted active:scale-90 ${
                  currentReaction === emoji ? "bg-primary/15 ring-1 ring-inset ring-primary/50" : ""
                }`}
                aria-label={currentReaction === emoji ? `Remover reação ${emoji}` : `Reagir com ${emoji}`}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}

      {currentReaction && (
        <button
          type="button"
          onClick={() => selectReaction(currentReaction)}
          className="flex min-h-10 w-full items-center justify-center gap-2 border-t border-border px-3 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
          Remover minha reação
        </button>
      )}
    </div>,
    document.body,
  );
}
