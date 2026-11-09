import { sbcConversationPresentation } from "@/lib/ai-assistant/conversation-presentation";

type Sequence = { provider: "codex" | "claude"; index: number; messages: [string, string] };

export function readAliceMessageSequence(usage: unknown): Sequence | null {
  if (!usage || typeof usage !== "object" || Array.isArray(usage)) return null;
  const sequence = (usage as Record<string, unknown>).sequence;
  if (!sequence || typeof sequence !== "object" || Array.isArray(sequence)) return null;
  const item = sequence as Record<string, unknown>;
  if ((item.provider !== "codex" && item.provider !== "claude") || !Number.isInteger(item.index) || !Array.isArray(item.messages)
    || item.messages.length !== 2 || item.messages.some((message) => typeof message !== "string" || !message.trim())) return null;
  return { provider: item.provider, index: item.index as number, messages: [item.messages[0], item.messages[1]] };
}

export function aliceSequenceCanContinue(draft: { status: string; sentMessageId: string | null; usage: unknown }, latestMessageId: string | null | undefined) {
  const sequence = readAliceMessageSequence(draft.usage);
  return draft.status === "sent" && Boolean(latestMessageId && draft.sentMessageId === latestMessageId) && sequence?.index === 0;
}

export function isSbcBotoxOpeningContext(unit: string, prompt: unknown) {
  if (unit !== "SBC" || !prompt || typeof prompt !== "object" || Array.isArray(prompt)) return false;
  const input = prompt as Record<string, unknown>;
  const dialogue = Array.isArray(input.CONVERSA) ? input.CONVERSA : [];
  const text = `${typeof input.CAMPANHA === "string" ? input.CAMPANHA : ""} ${JSON.stringify(dialogue)}`
    .normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  return /\bbotox\b/u.test(text) && /\bterco\s+superior\b/u.test(text);
}
export function isSbcOpeningSequenceContext(unit: string, prompt: unknown) {
  return unit === "SBC" && Boolean(sbcConversationPresentation(prompt));
}
