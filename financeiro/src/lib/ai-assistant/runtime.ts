import { ALICE_KNOWLEDGE } from "@/generated/alice-knowledge";
import { AiAssistantError } from "@/lib/ai-assistant/policy";

export function aliceRuntimeStatus() {
  const checks = {
    privateKnowledge: ALICE_KNOWLEDGE.available,
    hermesBridgeConfigured: Boolean(process.env.ALICE_HERMES_BRIDGE_URL?.trim() && (process.env.ALICE_HERMES_BRIDGE_SECRET?.trim().length || 0) >= 32),
    ownerConfigured: Boolean(process.env.ALICE_OWNER_USER_ID?.trim()),
    conversationDataApproved: process.env.ALICE_CONVERSATION_DATA_APPROVED === "true",
    liveSuggestionsEnabled: process.env.ALICE_ENABLE_LIVE_SUGGESTIONS === "true",
  };
  const blockers = [
    ...(!checks.privateKnowledge ? ["Base privada da Alice ainda não foi conectada ao build."] : []),
    ...(!checks.hermesBridgeConfigured ? ["Ponte privada do Hermes não configurada."] : []),
    ...(!checks.ownerConfigured ? ["Usuário proprietário da Alice não configurado."] : []),
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
