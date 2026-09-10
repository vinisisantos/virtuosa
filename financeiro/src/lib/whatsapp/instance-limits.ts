export const MAX_ACTIVE_WHATSAPP_INSTANCES_PER_OWNER_UNIT = 5;

type ConnectionScopedInstance = {
  userId?: string | null;
  unit?: string | null;
  status?: string | null;
};

export function countActiveWhatsAppInstancesForConnection(
  instances: ConnectionScopedInstance[],
  ownerUserId: string,
  unit?: string | null,
) {
  return instances.filter((instance) => {
    const sameOwner = instance.userId === ownerUserId;
    const sameUnit = !unit || !instance.unit || instance.unit === unit || instance.unit === "Todas";
    const isActive = instance.status === "connected" || instance.status === "connecting";
    return sameOwner && sameUnit && isActive;
  }).length;
}
