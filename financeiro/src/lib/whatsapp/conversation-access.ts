import { prisma } from "@/lib/db";
import { getInstancesForRequest } from "@/lib/whatsapp/instance-resolver";

export type ConversationCapability = "view" | "reply" | "manage";

function instanceHasCapability(instance: any, capability: ConversationCapability) {
  if (capability === "manage") return instance.canManage === true;
  if (capability === "reply") return instance.canReply === true;
  return instance.canView !== false;
}

export async function findAuthorizedConversation(
  req: Request,
  conversationId: string,
  capability: ConversationCapability,
) {
  const { instances } = await getInstancesForRequest(req);
  const allowedInstances = instances.filter((instance) => instanceHasCapability(instance, capability));
  const allowedInstanceIds = allowedInstances.map((instance) => instance.id);
  if (!allowedInstanceIds.length) return null;

  const conversation = await prisma.whatsAppConversation.findFirst({
    where: {
      id: conversationId,
      instanceId: { in: allowedInstanceIds },
    },
    include: { contact: true, instance: true },
  });
  if (!conversation) return null;

  return {
    ...conversation,
    authorizedInstance: allowedInstances.find((instance) => instance.id === conversation.instanceId) || null,
  };
}
