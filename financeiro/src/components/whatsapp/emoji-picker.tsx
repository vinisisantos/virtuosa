"use client";

import { useState } from "react";
import { X } from "lucide-react";

export const WHATSAPP_EMOJI_CATEGORIES = [
  {
    id: "frequentes",
    label: "Frequentes",
    icon: "😊",
    emojis: ["😀", "😊", "😍", "🥰", "😉", "🤗", "🙏", "👍", "👏", "🙌", "❤️", "💜", "✨", "🎉", "🌷", "😘"],
  },
  {
    id: "rostos",
    label: "Rostos",
    icon: "😀",
    emojis: ["😄", "😁", "😅", "😂", "🙂", "😌", "🤩", "🥳", "😎", "🤔", "😢", "🥺", "😴", "😮", "😬", "😇"],
  },
  {
    id: "gestos",
    label: "Gestos",
    icon: "👋",
    emojis: ["👋", "🤝", "👌", "✌️", "🤞", "💪", "👀", "🫶", "💅", "💆‍♀️", "💆‍♂️", "💁‍♀️", "🙋‍♀️", "🙋‍♂️", "🤍", "💖"],
  },
  {
    id: "objetos",
    label: "Objetos",
    icon: "✨",
    emojis: ["📅", "📍", "📲", "📞", "💬", "✅", "⚠️", "⏰", "💰", "💳", "🎁", "🔥", "⭐", "🌟", "💉", "🧴"],
  },
] as const;

type Props = {
  open: boolean;
  onClose: () => void;
  onSelect: (emoji: string) => void;
};

export function EmojiPicker({ open, onClose, onSelect }: Props) {
  const [activeCategory, setActiveCategory] = useState<(typeof WHATSAPP_EMOJI_CATEGORIES)[number]["id"]>("frequentes");

  if (!open) return null;

  const category = WHATSAPP_EMOJI_CATEGORIES.find((item) => item.id === activeCategory) || WHATSAPP_EMOJI_CATEGORIES[0];

  return (
    <div
      className="absolute bottom-[calc(100%+0.6rem)] left-[-5.5rem] z-[70] w-[min(21rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-border bg-popover text-popover-foreground shadow-2xl sm:left-0"
      role="dialog"
      aria-label="Selecionar emoji"
    >
      <div className="flex min-h-11 items-center justify-between border-b border-border px-3">
        <span className="text-xs font-semibold">Emojis</span>
        <button
          type="button"
          onClick={onClose}
          className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Fechar emojis"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-border p-1.5" role="tablist" aria-label="Categorias de emojis">
        {WHATSAPP_EMOJI_CATEGORIES.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={item.id === activeCategory}
            aria-label={item.label}
            title={item.label}
            onClick={() => setActiveCategory(item.id)}
            className={`flex h-10 min-w-10 flex-1 items-center justify-center rounded-lg text-xl transition-colors ${
              item.id === activeCategory ? "bg-primary/12" : "hover:bg-muted"
            }`}
          >
            {item.icon}
          </button>
        ))}
      </div>

      <div className="grid max-h-[min(42dvh,280px)] grid-cols-8 gap-0.5 overflow-y-auto overscroll-contain p-2 sm:grid-cols-8">
        {category.emojis.map((emoji) => (
          <button
            key={emoji}
            type="button"
            onClick={() => onSelect(emoji)}
            className="flex aspect-square min-h-10 items-center justify-center rounded-lg text-[22px] transition-transform hover:bg-muted active:scale-90"
            aria-label={`Inserir ${emoji}`}
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}
