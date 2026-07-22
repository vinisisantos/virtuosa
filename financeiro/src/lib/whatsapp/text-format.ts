export type WhatsAppTextNode =
  | { type: "text"; value: string }
  | { type: "bold" | "italic" | "strikethrough"; children: WhatsAppTextNode[] }
  | { type: "code"; value: string };

type Marker = {
  value: string;
  type: Exclude<WhatsAppTextNode["type"], "text">;
};

const MARKERS: Marker[] = [
  { value: "```", type: "code" },
  { value: "*", type: "bold" },
  { value: "_", type: "italic" },
  { value: "~", type: "strikethrough" },
  { value: "`", type: "code" },
];

const MARKER_BOUNDARY = /[\s([{.,!?;:'"*_~`]/;
const CLOSING_BOUNDARY = /[\s)\]}.,!?;:'"*_~`]/;
const FORMATTED_SPEAKER_LABEL = /(^|\n)([*_~]{0,3})#(?=[\p{L}][^:\n]{0,39}:)/gu;

function normalizeDisplayText(text: string) {
  // Alguns sistemas enviam nomes como `_*#Adson:*_`: o # tenta simular um
  // cabeçalho Markdown, mas no WhatsApp ele é texto literal. Removemos apenas
  // o marcador de um rótulo curto terminado em dois-pontos no início da linha.
  return text.replace(FORMATTED_SPEAKER_LABEL, "$1$2");
}

function isOpeningMarker(text: string, index: number, marker: string) {
  const previous = index > 0 ? text[index - 1] : "";
  const next = text[index + marker.length] || "";
  if (marker === "```") return Boolean(next && (!previous || MARKER_BOUNDARY.test(previous)));
  return Boolean(next && !/\s/.test(next) && (!previous || MARKER_BOUNDARY.test(previous)));
}

function isClosingMarker(text: string, index: number, marker: string) {
  const previous = text[index - 1] || "";
  const next = text[index + marker.length] || "";
  if (marker === "```") return Boolean(previous && (!next || CLOSING_BOUNDARY.test(next)));
  return Boolean(previous && !/\s/.test(previous) && (!next || CLOSING_BOUNDARY.test(next)));
}

function findClosingMarker(text: string, start: number, marker: string) {
  let index = text.indexOf(marker, start);
  while (index >= 0) {
    if (isClosingMarker(text, index, marker)) return index;
    index = text.indexOf(marker, index + marker.length);
  }
  return -1;
}

function findNextFormat(text: string, start: number) {
  let best: { marker: Marker; open: number; close: number } | null = null;

  for (const marker of MARKERS) {
    let open = text.indexOf(marker.value, start);
    while (open >= 0) {
      if (isOpeningMarker(text, open, marker.value)) {
        const contentStart = open + marker.value.length;
        const close = findClosingMarker(text, contentStart, marker.value);
        if (close > contentStart) {
          if (!best || open < best.open || (open === best.open && marker.value.length > best.marker.value.length)) {
            best = { marker, open, close };
          }
          break;
        }
      }
      open = text.indexOf(marker.value, open + marker.value.length);
    }
  }

  return best;
}

export function parseWhatsAppText(text: string): WhatsAppTextNode[] {
  const displayText = normalizeDisplayText(text);
  const nodes: WhatsAppTextNode[] = [];
  let cursor = 0;

  while (cursor < displayText.length) {
    const format = findNextFormat(displayText, cursor);
    if (!format) {
      nodes.push({ type: "text", value: displayText.slice(cursor) });
      break;
    }

    if (format.open > cursor) {
      nodes.push({ type: "text", value: displayText.slice(cursor, format.open) });
    }

    const contentStart = format.open + format.marker.value.length;
    const content = displayText.slice(contentStart, format.close);
    if (format.marker.type === "code") {
      nodes.push({ type: "code", value: content });
    } else {
      nodes.push({ type: format.marker.type, children: parseWhatsAppText(content) });
    }
    cursor = format.close + format.marker.value.length;
  }

  return nodes;
}

function nodeText(node: WhatsAppTextNode): string {
  if (node.type === "text" || node.type === "code") return node.value;
  return node.children.map(nodeText).join("");
}

export function plainWhatsAppText(text?: string | null) {
  return parseWhatsAppText(text || "").map(nodeText).join("");
}
