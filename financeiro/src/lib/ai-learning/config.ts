import { prisma } from "@/lib/db";
import { AI_LEARNING_CONFIG_KEY, AiLearningError, parseAiLearningConfig } from "@/lib/ai-learning/policy";

export async function loadAiLearningConfig() {
  const setting = await prisma.appSetting.findUnique({
    where: { key: AI_LEARNING_CONFIG_KEY },
    select: { value: true },
  });
  const config = parseAiLearningConfig(setting?.value);
  if (!config.enabled) throw new AiLearningError("O aprendizado de SBC está pausado", 503);
  return config;
}
