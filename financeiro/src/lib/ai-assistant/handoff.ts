import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import type { AliceUnit } from "@/lib/ai-assistant/policy";

type HandoffReason = "clinical_safety" | "unsupported_procedure" | "model_requested";
type Recipient = {
  id: string;
  name: string;
  role: string;
  unit: string | null;
  permissions: unknown;
  isActive: boolean;
};

function permissionSet(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function hasCrmAccess(user: Recipient) {
  return user.isActive && (user.role === "ADMINISTRADOR" || permissionSet(user.permissions).crm === true);
}

function belongsToUnit(user: Recipient, unit: AliceUnit) {
  const permissions = permissionSet(user.permissions);
  return user.unit === unit || permissions[unit === "SBC" ? "unitSBC" : "unitOsasco"] === true;
}

function notificationId(value: string) {
  const hex = createHash("sha256").update(value).digest("hex").slice(0, 32).split("");
  hex[12] = "5";
  hex[16] = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  const formatted = hex.join("");
  return `${formatted.slice(0, 8)}-${formatted.slice(8, 12)}-${formatted.slice(12, 16)}-${formatted.slice(16, 20)}-${formatted.slice(20)}`;
}

export async function routeAliceHandoff(params: {
  conversationId: string;
  instanceId: string;
  sourceMessageId: string;
  unit: AliceUnit;
  reason: HandoffReason;
}) {
  const instance = await prisma.whatsAppInstance.findFirst({
    where: { id: params.instanceId },
    select: {
      unit: true,
      userId: true,
      defaultAssigneeId: true,
      user: { select: { id: true, name: true, role: true, unit: true, permissions: true, isActive: true } },
      members: {
        where: { isActive: true, role: { in: ["MANAGER", "AGENT"] }, user: { isActive: true } },
        select: { userId: true, role: true, user: { select: { id: true, name: true, role: true, unit: true, permissions: true, isActive: true } } },
      },
    },
  });
  if (!instance) return { notified: 0, assigned: false };

  const permittedInstanceUsers = new Map<string, Recipient>();
  if (instance.user) permittedInstanceUsers.set(instance.user.id, instance.user);
  for (const member of instance.members) permittedInstanceUsers.set(member.user.id, member.user);

  let assignedRecipient: Recipient | null = null;
  let recipients: Recipient[] = [];
  if (params.unit === "SBC") {
    const handoffUserId = process.env.ALICE_SBC_HANDOFF_USER_ID?.trim();
    const commercial = handoffUserId ? await prisma.user.findUnique({
      where: { id: handoffUserId },
      select: { id: true, name: true, role: true, unit: true, permissions: true, isActive: true },
    }) as Recipient | null : null;
    if (commercial && hasCrmAccess(commercial) && belongsToUnit(commercial, "SBC")) assignedRecipient = commercial;
    recipients = assignedRecipient ? [assignedRecipient] : [...permittedInstanceUsers.values()].filter(
      (user) => hasCrmAccess(user) && belongsToUnit(user, "SBC"),
    );
  } else {
    // Osasco alerts are restricted to already-authorized instance users who belong to Osasco.
    recipients = [...permittedInstanceUsers.values()].filter(
      (user) => hasCrmAccess(user) && belongsToUnit(user, "Osasco"),
    );
    const defaultAssignee = instance.defaultAssigneeId
      ? permittedInstanceUsers.get(instance.defaultAssigneeId)
      : null;
    if (defaultAssignee && hasCrmAccess(defaultAssignee) && belongsToUnit(defaultAssignee, "Osasco")) {
      assignedRecipient = defaultAssignee;
    }
  }

  const uniqueRecipients = [...new Map(recipients.map((user) => [user.id, user])).values()];
  if (!uniqueRecipients.length) return { notified: 0, assigned: false };

  const link = params.unit === "SBC" && assignedRecipient
    ? `/crm/inbox/alice-handoff/${encodeURIComponent(params.conversationId)}`
    : `/crm/inbox?targetInstanceId=${encodeURIComponent(params.instanceId)}&conversationId=${encodeURIComponent(params.conversationId)}`;
  const message = "Alice sinalizou que este atendimento precisa de apoio humano. Abra a conversa e retome o atendimento.";
  const notifications = uniqueRecipients.map((user) => ({
    id: notificationId(`${params.conversationId}:${params.sourceMessageId}:${user.id}:alice-handoff`),
    userId: user.id,
    type: "AI_HUMAN_HANDOFF",
    title: params.unit === "Osasco" ? "Atendimento para a equipe de Osasco" : "Atendimento encaminhado para apoio humano",
    message,
    icon: "support_agent",
    link,
    unit: params.unit,
  }));

  await prisma.$transaction(async (tx) => {
    if (assignedRecipient) {
      await tx.whatsAppConversation.updateMany({
        where: { id: params.conversationId, instanceId: params.instanceId },
        data: { assignedTo: assignedRecipient.id, assignedToName: assignedRecipient.name },
      });
    }
    await tx.notification.createMany({ data: notifications, skipDuplicates: true });
  });
  return { notified: uniqueRecipients.length, assigned: Boolean(assignedRecipient) };
}

export function aliceHandoffReasonLabel(reason: HandoffReason) {
  if (reason === "clinical_safety") return "Dúvida clínica direcionada para avaliação profissional";
  if (reason === "unsupported_procedure") return "Procedimento fora do escopo ativo encaminhado à equipe";
  return "A Alice identificou que a conversa precisa de atendimento humano";
}

export function buildAliceHandoffNotificationIdForTest(value: string) {
  return notificationId(value);
}
