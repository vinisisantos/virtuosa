import { prisma } from "@/lib/db";

const UNIT_PERMISSION_KEY: Record<string, string> = {
  Osasco: "unitOsasco",
  SBC: "unitSBC",
  SCS: "unitSCS",
  Barueri: "unitBarueri",
};

const ASSIGNEE_COLORS = ["#8b5cf6", "#06b6d4", "#10b981", "#f59e0b", "#ef4444", "#ec4899"];

type UserLike = {
  id: string;
  name: string;
  email?: string | null;
  role?: string | null;
  unit?: string | null;
  permissions?: unknown;
};

type PipelineDealLike = {
  id: string;
  clientName: string;
  unit: string;
  notes?: string | null;
};

export function pipelineEvaluationMarker(dealId: string) {
  return `[pipelineDealId:${dealId}]`;
}

export function getPipelineDealIdFromEvaluationNotes(notes?: string | null) {
  return notes?.match(/\[pipelineDealId:([^\]]+)\]/)?.[1] || null;
}

export function evaluationAssignedUserMarker(userId: string) {
  return `[assignedUserId:${userId}]`;
}

export function normalizeEvaluationText(value?: string | null): string {
  return (value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

function permissionsRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function userCanUseEvaluationUnit(user: UserLike, unit: string) {
  const permissions = permissionsRecord(user.permissions);
  const key = UNIT_PERMISSION_KEY[unit];
  return (
    user.unit === unit ||
    permissions.admin === true ||
    permissions.multiUnit === true ||
    (!!key && permissions[key] === true)
  );
}

function userMatchesName(user: UserLike, token: string) {
  const normalizedToken = normalizeEvaluationText(token);
  return (
    normalizeEvaluationText(user.name).includes(normalizedToken) ||
    normalizeEvaluationText(user.email).includes(normalizedToken)
  );
}

export async function getEvaluationAssigneeUsers(unit: string) {
  const users = await prisma.user.findMany({
    where: { isActive: true },
    select: { id: true, name: true, email: true, role: true, unit: true, permissions: true },
    orderBy: { name: "asc" },
  });

  return users.filter((user) => user.role !== "ADMINISTRADOR" && userCanUseEvaluationUnit(user, unit));
}

export async function resolveEvaluationAssignee(unit: string, assigneeUserId?: string | null) {
  if (assigneeUserId) {
    const user = await prisma.user.findFirst({
      where: { id: assigneeUserId, isActive: true },
      select: { id: true, name: true, email: true, role: true, unit: true, permissions: true },
    });
    if (!user || !userCanUseEvaluationUnit(user, unit)) {
      throw new Error("Responsável inválido para esta unidade");
    }
    return user;
  }

  if (unit === "Osasco") {
    const assignees = await getEvaluationAssigneeUsers(unit);
    const larissa = assignees.find((user) => userMatchesName(user, "larissa"));
    if (larissa) return larissa;
  }

  throw new Error("Selecione a responsável pela avaliação");
}

export async function ensureProfessionalForEvaluationUser(user: UserLike, unit: string) {
  const existing = await prisma.profissional.findFirst({
    where: { unit, isActive: true, name: { equals: user.name, mode: "insensitive" } },
  });
  if (existing) return existing;

  return prisma.profissional.create({
    data: {
      name: user.name,
      unit,
      color: ASSIGNEE_COLORS[Math.floor(Math.random() * ASSIGNEE_COLORS.length)],
    },
  });
}

export async function upsertPipelineEvaluationAppointment(params: {
  deal: PipelineDealLike;
  clientPhone?: string | null;
  startTime: string | Date;
  assigneeUserId?: string | null;
  durationMinutes?: number | null;
}) {
  const startTime = new Date(params.startTime);
  if (Number.isNaN(startTime.getTime())) {
    throw new Error("Data da avaliação inválida");
  }

  const assignee = await resolveEvaluationAssignee(params.deal.unit, params.assigneeUserId);
  const profissional = await ensureProfessionalForEvaluationUser(assignee, params.deal.unit);
  const durationMinutes = Math.max(15, Number(params.durationMinutes || 60));
  const endTime = new Date(startTime.getTime() + durationMinutes * 60 * 1000);
  const marker = pipelineEvaluationMarker(params.deal.id);
  const assignedMarker = evaluationAssignedUserMarker(assignee.id);

  const existing = await prisma.agendamento.findFirst({
    where: {
      unit: params.deal.unit,
      procedimento: { contains: "Avalia" },
      notes: { contains: marker },
    },
    orderBy: { updatedAt: "desc" },
  });

  const notes = [
    "Origem: Pipeline CRM",
    marker,
    assignedMarker,
    params.deal.notes ? `Observações do negócio: ${params.deal.notes}` : null,
  ].filter(Boolean).join("\n");

  const data = {
    clientName: params.deal.clientName,
    clientPhone: params.clientPhone || null,
    procedimento: "Avaliação",
    profissionalId: profissional.id,
    unit: params.deal.unit,
    startTime,
    endTime,
    status: "pendente",
    notes,
  };

  if (existing) {
    return prisma.agendamento.update({
      where: { id: existing.id },
      data,
      include: { profissional: true },
    });
  }

  return prisma.agendamento.create({
    data,
    include: { profissional: true },
  });
}

export async function getPipelineEvaluationAppointments(dealIds: string[]) {
  const appointments = dealIds.length
    ? await prisma.agendamento.findMany({
        where: {
          OR: dealIds.map((dealId) => ({ notes: { contains: pipelineEvaluationMarker(dealId) } })),
        },
        include: { profissional: true },
        orderBy: { startTime: "desc" },
      })
    : [];

  const byDealId = new Map<string, (typeof appointments)[number]>();
  for (const appointment of appointments) {
    for (const dealId of dealIds) {
      if (!appointment.notes?.includes(pipelineEvaluationMarker(dealId))) continue;
      if (!byDealId.has(dealId)) byDealId.set(dealId, appointment);
      break;
    }
  }
  return byDealId;
}
