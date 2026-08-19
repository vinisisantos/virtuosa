import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import {
  EVALUATION_CONFIRMATION_REQUEST_AUTOMATION_TRIGGER,
  EVALUATION_DAY_REMINDER_AUTOMATION_TRIGGER,
  EVALUATION_NO_SHOW_AUTOMATION_TRIGGER,
  EVALUATION_SCHEDULE_UNIT_CONFIGS,
  EVALUATION_SCHEDULED_AUTOMATION_TRIGGER,
  getEvaluationScheduleUnitConfigByUnit,
  getEvaluationScheduleAutomationMessage,
} from "@/lib/whatsapp/evaluation-schedule-confirmation-message";
import { ensureEvaluationConfirmationRequestAutomations } from "@/lib/whatsapp/evaluation-confirmation-automation";
import { ensureEvaluationNoShowAutomations } from "@/lib/whatsapp/evaluation-no-show-automation";
import { ensureEvaluationDayReminderAutomations } from "@/lib/whatsapp/evaluation-day-reminder-automation";
import {
  DEFAULT_EVALUATION_CONFIRMATION_WINDOW_HOURS,
  isValidEvaluationConfirmationWindowHours,
} from "@/lib/whatsapp/evaluation-confirmation-window";

const CTWA_WELCOME_TRIGGER = "ctwa_welcome";
const NATIVE_AUTOMATION_TRIGGERS = new Set([
  CTWA_WELCOME_TRIGGER,
  EVALUATION_CONFIRMATION_REQUEST_AUTOMATION_TRIGGER,
  EVALUATION_DAY_REMINDER_AUTOMATION_TRIGGER,
  EVALUATION_NO_SHOW_AUTOMATION_TRIGGER,
  EVALUATION_SCHEDULED_AUTOMATION_TRIGGER,
]);

function jsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

async function ensureCtwaWelcomeAutomation(createdBy?: string | null) {
  const existing = await prisma.automation.findFirst({
    where: { triggerType: CTWA_WELCOME_TRIGGER, unit: null },
  });
  if (existing) return existing;

  return prisma.automation.create({
    data: {
      name: "Saudação para novos leads de campanhas",
      description: "Envia uma saudação somente para novos leads click-to-WhatsApp e captura o nome informado.",
      triggerType: CTWA_WELCOME_TRIGGER,
      triggerConfig: {
        units: ["Osasco", "SBC", "SCS"],
        requireCampaignSignal: true,
        requireUnassignedConversation: true,
        captureName: true,
      },
      steps: [
        {
          type: "send_message",
          config: {
            message: "Olá! Seja muito bem-vinda(o) à Clínica Virtuosa. ✨\n\nEstamos felizes com o seu interesse em nossos tratamentos. Pode me informar o seu nome ?",
          },
        },
        {
          type: "send_message",
          config: {
            message: "Prazer em conhecer você, {{nome}}! 💗\n\nEm breve, nossa atendente dará continuidade ao seu atendimento.",
          },
        },
      ],
      isActive: true,
      createdBy: createdBy || "Sistema",
      unit: null,
    },
  });
}

async function ensureEvaluationScheduledAutomations(createdBy?: string | null) {
  const units = EVALUATION_SCHEDULE_UNIT_CONFIGS.map((config) => config.unit);
  const existing = await prisma.automation.findMany({
    where: {
      triggerType: EVALUATION_SCHEDULED_AUTOMATION_TRIGGER,
      unit: { in: units },
    },
  });
  const existingUnits = new Set(existing.map((automation) => automation.unit));
  const created = await Promise.all(
    EVALUATION_SCHEDULE_UNIT_CONFIGS
      .filter((config) => !existingUnits.has(config.unit))
      .map((config) => prisma.automation.create({
        data: {
          name: `Confirmação de avaliação agendada — ${config.unit}`,
          description: `Envia os dados da avaliação assim que o agendamento é confirmado na ${config.instanceDisplayName}.`,
          triggerType: EVALUATION_SCHEDULED_AUTOMATION_TRIGGER,
          triggerConfig: {
            topic: "AGENDA",
            units: [config.unit],
            instanceIds: [config.instanceId],
          },
          steps: [
            {
              type: "send_message",
              config: { message: config.scheduledTemplate },
            },
          ],
          isActive: true,
          createdBy: createdBy || "Sistema",
          unit: config.unit,
        },
      })),
  );
  return [...existing, ...created];
}

// GET /api/crm/automations — listar automações
export async function GET(req: NextRequest) {
  const auth = await requireRole(req, ["ADMINISTRADOR"]);
  if ("error" in auth) return auth.error;

  try {
    const { searchParams } = new URL(req.url);
    const unit = searchParams.get("unit");
    await ensureCtwaWelcomeAutomation(auth.user.name || auth.user.email);
    await Promise.all([
      ensureEvaluationScheduledAutomations(auth.user.name || auth.user.email),
      ensureEvaluationConfirmationRequestAutomations(auth.user.name || auth.user.email),
      ensureEvaluationDayReminderAutomations(auth.user.name || auth.user.email),
      ensureEvaluationNoShowAutomations(auth.user.name || auth.user.email),
    ]);

    const where: Record<string, unknown> = {};
    if (unit) where.unit = unit;

    const automations = await prisma.automation.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { logs: true } },
      },
    });

    return NextResponse.json({ automations });
  } catch (error) {
    console.error("[GET /api/crm/automations]", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

// POST /api/crm/automations — criar automação
export async function POST(req: NextRequest) {
  const auth = await requireRole(req, ["ADMINISTRADOR"]);
  if ("error" in auth) return auth.error;

  try {
    const body = await req.json();
    const { name, description, triggerType, triggerConfig, steps, isActive, createdBy, unit } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: "Nome é obrigatório" }, { status: 400 });
    }
    if (!triggerType) {
      return NextResponse.json({ error: "Tipo de gatilho é obrigatório" }, { status: 400 });
    }
    if (NATIVE_AUTOMATION_TRIGGERS.has(triggerType)) {
      return NextResponse.json({ error: "Este gatilho é reservado para uma automação nativa do sistema." }, { status: 400 });
    }
    if (!steps || !Array.isArray(steps) || steps.length === 0) {
      return NextResponse.json({ error: "Adicione pelo menos uma ação" }, { status: 400 });
    }

    const automation = await prisma.automation.create({
      data: {
        name: name.trim(),
        description: description || null,
        triggerType,
        triggerConfig: triggerConfig || null,
        steps,
        isActive: !!isActive,
        createdBy: createdBy || auth.user.name || auth.user.email || null,
        unit: unit || null,
      },
    });

    return NextResponse.json({ automation }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/crm/automations]", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

// PUT /api/crm/automations — atualizar automação
export async function PUT(req: NextRequest) {
  const auth = await requireRole(req, ["ADMINISTRADOR"]);
  if ("error" in auth) return auth.error;

  try {
    const body = await req.json();
    const { id, ...data } = body;

    if (!id) return NextResponse.json({ error: "ID é obrigatório" }, { status: 400 });

    const existing = await prisma.automation.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Automação não encontrada" }, { status: 404 });
    if (NATIVE_AUTOMATION_TRIGGERS.has(existing.triggerType)) {
      const requestedTriggerConfig = jsonObject(data.triggerConfig);
      delete data.triggerType;
      delete data.triggerConfig;
      delete data.unit;
      delete data.createdBy;

      if (existing.triggerType === EVALUATION_CONFIRMATION_REQUEST_AUTOMATION_TRIGGER) {
        const unitConfig = getEvaluationScheduleUnitConfigByUnit(existing.unit);
        if (!unitConfig) {
          return NextResponse.json({ error: "Unidade inválida para a automação de agenda." }, { status: 400 });
        }
        const existingTriggerConfig = jsonObject(existing.triggerConfig);
        const requestedWindowHours = requestedTriggerConfig.windowHours
          ?? existingTriggerConfig.windowHours
          ?? DEFAULT_EVALUATION_CONFIRMATION_WINDOW_HOURS;

        if (!isValidEvaluationConfirmationWindowHours(requestedWindowHours)) {
          return NextResponse.json(
            { error: "A antecedência deve ser um número inteiro entre 1 e 168 horas." },
            { status: 400 },
          );
        }

        data.triggerConfig = {
          ...existingTriggerConfig,
          topic: "AGENDA",
          units: [unitConfig.unit],
          instanceIds: [unitConfig.instanceId],
          manualAction: true,
          windowHours: Number(requestedWindowHours),
        };
      }
    }
    if (
      [
        EVALUATION_SCHEDULED_AUTOMATION_TRIGGER,
        EVALUATION_CONFIRMATION_REQUEST_AUTOMATION_TRIGGER,
        EVALUATION_DAY_REMINDER_AUTOMATION_TRIGGER,
        EVALUATION_NO_SHOW_AUTOMATION_TRIGGER,
      ].includes(existing.triggerType)
      && data.steps !== undefined
    ) {
      const message = getEvaluationScheduleAutomationMessage(data.steps);
      if (!message) {
        return NextResponse.json({ error: "Informe a mensagem da automação de agenda." }, { status: 400 });
      }
      data.steps = [{ type: "send_message", config: { message } }];
    }

    const automation = await prisma.automation.update({
      where: { id },
      data,
    });

    return NextResponse.json({ automation });
  } catch (error) {
    console.error("[PUT /api/crm/automations]", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

// DELETE /api/crm/automations?id=xxx
export async function DELETE(req: NextRequest) {
  const auth = await requireRole(req, ["ADMINISTRADOR"]);
  if ("error" in auth) return auth.error;

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "ID obrigatório" }, { status: 400 });

    const existing = await prisma.automation.findUnique({ where: { id } });
    if (existing && NATIVE_AUTOMATION_TRIGGERS.has(existing.triggerType)) {
      return NextResponse.json({ error: "Automações nativas do sistema não podem ser excluídas." }, { status: 400 });
    }

    await prisma.automation.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/crm/automations]", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
