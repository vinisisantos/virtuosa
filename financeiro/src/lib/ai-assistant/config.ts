import { prisma } from "@/lib/db";
import { AI_ASSISTANT_CONFIG_KEY, parseAiAssistantConfig } from "@/lib/ai-assistant/policy";

export async function loadAiAssistantConfig() {
  const setting = await prisma.appSetting.findUnique({
    where: { key: AI_ASSISTANT_CONFIG_KEY },
    select: { value: true },
  });
  return parseAiAssistantConfig(setting?.value);
}
