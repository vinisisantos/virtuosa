import { AiAssistantError } from "@/lib/ai-assistant/policy";

export function canUseAliceSuggestions(userId: string | null | undefined) {
  const ownerId = process.env.ALICE_OWNER_USER_ID?.trim();
  const secondaryId = process.env.ALICE_SECONDARY_USER_ID?.trim();
  return Boolean(ownerId && userId && (userId === ownerId || (secondaryId && userId === secondaryId)));
}

export function requireAliceAuthorizedUser(userId: string | null | undefined) {
  if (!userId) throw new AiAssistantError("Não autorizado", 401);
  if (!canUseAliceSuggestions(userId)) throw new AiAssistantError("Alice está disponível apenas para os usuários autorizados", 403);
}
