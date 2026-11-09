import { prisma } from "@/lib/db";
import { ALICE_KNOWLEDGE } from "@/generated/alice-knowledge";
import { AI_ASSISTANT_CONFIG_KEY, parseAiAssistantConfig } from "@/lib/ai-assistant/policy";
import { ALICE_AUTONOMY_CONFIG_KEY, parseAliceAutonomyConfig } from "@/lib/ai-assistant/autonomy/policy";

export async function loadAliceAutonomyConfig(database = prisma) {
  const settings = await database.appSetting.findMany({
    where: { key: { in: [ALICE_AUTONOMY_CONFIG_KEY, AI_ASSISTANT_CONFIG_KEY] } },
    select: { key: true, value: true },
  });
  const config = parseAliceAutonomyConfig(settings.find((item) => item.key === ALICE_AUTONOMY_CONFIG_KEY)?.value);
  const assistant = parseAiAssistantConfig(settings.find((item) => item.key === AI_ASSISTANT_CONFIG_KEY)?.value);
  return { ...config, enabled: config.enabled && assistant.enabled };
}

export function aliceAutonomyRuntimeStatus() {
  const blockers = [
    ...(!ALICE_KNOWLEDGE.available ? ["Base privada da Alice indisponível no servidor."] : []),
    ...(!process.env.ANTHROPIC_API_KEY?.trim() ? ["Claude não configurado no servidor."] : []),
    ...(process.env.ALICE_CONVERSATION_DATA_APPROVED !== "true" ? ["Uso de trechos de conversa não habilitado."] : []),
    ...(process.env.ALICE_ENABLE_LIVE_SUGGESTIONS !== "true" ? ["Geração ao vivo está desativada no servidor."] : []),
  ];
  return { ready: blockers.length === 0, blockers };
}
