import { prisma } from "@/lib/db";

const CTWA_WELCOME_TRIGGER = "ctwa_welcome";
const DEFAULT_CTWA_GREETING = "Olá! Seja muito bem-vinda(o) à Clínica Virtuosa. ✨\n\nEstamos felizes com o seu interesse em nossos tratamentos. Pode me informar o seu nome ?";
const HUMAN_HANDOFF_PARAGRAPH = /(?:em breve|agora).{0,50}(?:atendente|especialista|equipe|pessoa).{0,80}(?:atender|atendimento|continuidade)|(?:atendente|especialista|equipe|pessoa).{0,80}(?:dar[aá]|seguir[aá]|continuar[aá]).{0,50}(?:atendimento|conversa)/i;

function firstSendMessage(steps: unknown) {
  if (!Array.isArray(steps)) return null;
  for (const item of steps) {
    if (!item || typeof item !== "object") continue;
    const step = item as { type?: unknown; config?: unknown };
    const config = step.config && typeof step.config === "object"
      ? step.config as { message?: unknown }
      : null;
    if (step.type === "send_message" && typeof config?.message === "string" && config.message.trim()) {
      return config.message.trim();
    }
  }
  return null;
}

function removeHumanHandoff(value: string) {
  const paragraphs = value
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph && !HUMAN_HANDOFF_PARAGRAPH.test(paragraph));
  return paragraphs.join("\n\n").trim() || DEFAULT_CTWA_GREETING;
}

export async function publicLeadSimulationGreeting(unit: string) {
  const automation = await prisma.automation.findFirst({
    where: {
      triggerType: CTWA_WELCOME_TRIGGER,
      isActive: true,
      OR: [{ unit: null }, { unit }],
    },
    orderBy: { updatedAt: "desc" },
    select: { steps: true },
  });
  return removeHumanHandoff(firstSendMessage(automation?.steps) || DEFAULT_CTWA_GREETING);
}
