import { ALICE_KNOWLEDGE } from "@/generated/alice-knowledge";
import { AiAssistantError } from "@/lib/ai-assistant/policy";

export function aliceRuntimeStatus() {
  const checks = {
    privateKnowledge: ALICE_KNOWLEDGE.available,
    modelCredential: Boolean(process.env.OPENAI_API_KEY?.trim()),
    conversationDataApproved: process.env.ALICE_OPENAI_CONVERSATION_DATA_APPROVED === "true",
    liveSuggestionsEnabled: process.env.ALICE_ENABLE_LIVE_SUGGESTIONS === "true",
  };
  const blockers = [
    ...(!checks.privateKnowledge ? ["Base privada da Alice ainda não foi conectada ao build."] : []),
    ...(!checks.modelCredential ? ["Credencial do modelo não configurada."] : []),
    ...(!checks.conversationDataApproved ? ["Uso de trechos de conversa no provedor externo não foi aprovado."] : []),
    ...(!checks.liveSuggestionsEnabled ? ["Sugestões ao vivo estão desativadas por segurança."] : []),
  ];
  return { ...checks, ready: blockers.length === 0, blockers };
}

export function requireAliceLiveRuntime() {
  if (!aliceRuntimeStatus().ready) {
    throw new AiAssistantError("Alice ainda não está habilitada para gerar sugestões de conversas reais", 503);
  }
}
