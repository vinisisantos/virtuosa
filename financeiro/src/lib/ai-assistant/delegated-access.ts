import { prisma } from "@/lib/db";
import { AiAssistantError } from "@/lib/ai-assistant/policy";

export async function loadAssignedAliceHandoff(req: Request, conversationId: string) {
  const userId = req.headers.get("x-user-id")?.trim();
  const handoffUserId = process.env.ALICE_SBC_HANDOFF_USER_ID?.trim();
  if (!userId || !handoffUserId || userId !== handoffUserId || !conversationId) {
    throw new AiAssistantError("Conversa não encontrada", 404);
  }

  const [user, conversation, handoffNotification] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, isActive: true, role: true, unit: true, permissions: true },
    }),
    prisma.whatsAppConversation.findFirst({
      where: { id: conversationId, assignedTo: userId, instance: { unit: "SBC" } },
      select: {
        id: true,
        instanceId: true,
        assignedTo: true,
        status: true,
        blockedAt: true,
        archivedAt: true,
        contact: { select: { name: true } },
        instance: true,
      },
    }),
    prisma.notification.findFirst({
      where: {
        userId,
        type: "AI_HUMAN_HANDOFF",
        unit: "SBC",
        link: `/crm/inbox/alice-handoff/${encodeURIComponent(conversationId)}`,
      },
      select: { id: true },
    }),
  ]);
  const permissions = user?.permissions && typeof user.permissions === "object" && !Array.isArray(user.permissions)
    ? user.permissions as Record<string, unknown>
    : {};
  if (!user?.isActive || (user.role !== "ADMINISTRADOR" && permissions.crm !== true)
    || (user.unit !== "SBC" && permissions.unitSBC !== true) || !conversation || !handoffNotification) {
    throw new AiAssistantError("Conversa não encontrada", 404);
  }
  return conversation;
}
