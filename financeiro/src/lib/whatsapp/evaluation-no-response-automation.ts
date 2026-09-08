import { prisma } from "@/lib/db";
import { EVALUATION_SCHEDULE_UNIT_CONFIGS, getEvaluationScheduleUnitConfigByUnit } from "@/lib/whatsapp/evaluation-schedule-confirmation-message";
import { DEFAULT_NO_RESPONSE_DELAY_HOURS, DEFAULT_NO_RESPONSE_MESSAGE, EVALUATION_NO_RESPONSE_TRIGGER, noResponseConfig, validNoResponseDelay } from "@/lib/whatsapp/evaluation-no-response-policy";

export function noResponseAutomationData(unit: string, now = new Date(), createdBy = "Sistema") {
  const config = getEvaluationScheduleUnitConfigByUnit(unit);
  if (!config) throw new Error("Unidade inválida para o lembrete.");
  return {
    id: `${EVALUATION_NO_RESPONSE_TRIGGER}:${unit}`,
    name: `Lembrete sem resposta — ${unit}`,
    description: "Envio manual pelo botão do chat para quem não respondeu à confirmação. Não envia automaticamente.",
    triggerType: EVALUATION_NO_RESPONSE_TRIGGER,
    triggerConfig: {
      topic: "AGENDA", units: [unit], instanceIds: [config.instanceId], deliveryMode: "manual",
      delayHours: DEFAULT_NO_RESPONSE_DELAY_HOURS, activatedAt: now.toISOString(),
    },
    steps: [{ type: "send_message", config: { message: DEFAULT_NO_RESPONSE_MESSAGE } }],
    isActive: true, unit, createdBy,
  };
}

export async function ensureEvaluationNoResponseAutomations(createdBy?: string, database = prisma) {
  const existing = await database.automation.findMany({
    where: { triggerType: EVALUATION_NO_RESPONSE_TRIGGER }, orderBy: { createdAt: "asc" },
  });
  const result = [];
  for (const { unit } of EVALUATION_SCHEDULE_UNIT_CONFIGS) {
    const current = existing.find((automation) => automation.unit === unit);
    // ID fixo + upsert impedem duplicação entre envio manual e abertura da tela.
    result.push(current || await database.automation.upsert({
      where: { id: `${EVALUATION_NO_RESPONSE_TRIGGER}:${unit}` },
      create: noResponseAutomationData(unit, new Date(), createdBy), update: {},
    }));
  }
  return result;
}

export async function ensureEvaluationNoResponseAutomation(unit: string, createdBy: string, database = prisma) {
  const data = noResponseAutomationData(unit, new Date(), createdBy);
  const existing = await database.automation.findFirst({
    where: { triggerType: EVALUATION_NO_RESPONSE_TRIGGER, unit }, orderBy: { createdAt: "asc" },
  });
  return existing || database.automation.upsert({ where: { id: data.id }, create: data, update: {} });
}

export function updatedNoResponseConfig(existing: { unit: string | null; isActive: boolean; triggerConfig: unknown }, data: { isActive?: unknown; triggerConfig?: unknown }, now = new Date()) {
  const unit = getEvaluationScheduleUnitConfigByUnit(existing.unit);
  if (!unit) throw new Error("Unidade inválida para o lembrete.");
  if (data.isActive !== undefined && typeof data.isActive !== "boolean") throw new Error("Ativação inválida.");
  const requested = data.triggerConfig && typeof data.triggerConfig === "object" && !Array.isArray(data.triggerConfig)
    ? data.triggerConfig as Record<string, unknown> : {};
  const previous = noResponseConfig(existing.triggerConfig);
  const delayHours = requested.delayHours ?? previous.delayHours;
  if (!validNoResponseDelay(delayHours)) throw new Error("O prazo deve ser um número inteiro de 1 a 24 horas.");
  const activating = data.isActive === true && !existing.isActive;
  return {
    topic: "AGENDA", units: [unit.unit], instanceIds: [unit.instanceId], deliveryMode: "manual", delayHours,
    // Nunca aceitar um marco retroativo enviado pelo navegador.
    activatedAt: (activating || !previous.activatedAt ? now : previous.activatedAt).toISOString(),
  };
}
