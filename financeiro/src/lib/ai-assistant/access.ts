import { AiAssistantError } from "@/lib/ai-assistant/policy";

export function canUseAliceSuggestions(userId: string | null | undefined) {
  const ownerId = process.env.ALICE_OWNER_USER_ID?.trim();
  return Boolean(ownerId && userId && userId === ownerId);
}

export function requireAliceOwner(userId: string | null | undefined) {
  if (!userId) throw new AiAssistantError("Não autorizado", 401);
  if (!canUseAliceSuggestions(userId)) throw new AiAssistantError("Alice está disponível apenas para o proprietário autorizado", 403);
}
