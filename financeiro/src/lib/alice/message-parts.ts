export const ALICE_MESSAGE_MAX_WORDS = 200;
export const ALICE_MESSAGE_MAX_CHARACTERS = 1_200;
export const ALICE_MAX_MESSAGE_PARTS = 32;
export const ALICE_DRAFT_MAX_CHARACTERS = 16_000;

/** Divide nas fronteiras do texto, sem resumir, cortar palavras ou pedir outra geração. */
export function splitAliceMessageParts(messages: readonly string[]): string[] {
  if (messages.join("").length > ALICE_DRAFT_MAX_CHARACTERS) throw new Error("alice_response_budget_exceeded");
  const parts: string[] = [];
  for (const message of messages) {
    let remaining = message.trim();
    if (!remaining) throw new Error("alice_empty_message");
    while (remaining) {
      const words = [...remaining.matchAll(/\S+/gu)];
      let end = words[ALICE_MESSAGE_MAX_WORDS]?.index ?? remaining.length;
      if (end > ALICE_MESSAGE_MAX_CHARACTERS) {
        const last = words.findLast(word => word.index! + word[0].length <= ALICE_MESSAGE_MAX_CHARACTERS);
        if (!last) throw new Error("alice_message_has_unsplittable_word");
        end = last.index! + last[0].length;
      }
      if (end < remaining.length) {
        const window = remaining.slice(0, end);
        const paragraph = [...window.matchAll(/\n\s*\n/gu)].at(-1)?.index;
        const sentence = [...window.matchAll(/[.!?]["”»)]*(?=\s|$)/gu)].at(-1);
        const boundary = paragraph ?? (sentence ? sentence.index! + sentence[0].length : undefined);
        if (boundary !== undefined && boundary >= end / 3) end = boundary;
      }
      const part = remaining.slice(0, end).trim();
      if (!part) throw new Error("alice_empty_message_part");
      parts.push(part);
      if (parts.length > ALICE_MAX_MESSAGE_PARTS) throw new Error("alice_response_budget_exceeded");
      remaining = remaining.slice(end).trim();
    }
  }
  return parts;
}
