export function filterInstancesToOwner<T extends { userId?: string | null }>(
  instances: T[],
  ownerUserId: string | null | undefined,
  ownerOnly: boolean,
) {
  if (!ownerOnly || !ownerUserId) return instances;
  return instances.filter((instance) => instance.userId === ownerUserId);
}

export function selectSingleDefaultInboxInstance<T extends {
  status?: string | null;
  phoneNumber?: string | null;
  phone?: string | null;
  name?: string | null;
  instanceName?: string | null;
}>(
  instances: T[],
  preferredPhone?: string | null,
  preferredInstanceName?: string | null,
) {
  const preferredDigits = normalizeInboxPhone(preferredPhone);
  if (preferredDigits) {
    const preferredMatches = instances.filter((instance) => (
      normalizeInboxPhone(instance.phoneNumber || instance.phone) === preferredDigits
    ));
    if (preferredMatches.length > 0) return preferredMatches.length === 1 ? preferredMatches : [];
  }

  if (preferredInstanceName) {
    const preferredMatches = instances.filter((instance) => (
      (instance.name || instance.instanceName) === preferredInstanceName
    ));
    if (preferredMatches.length > 0) return preferredMatches.length === 1 ? preferredMatches : [];
  }

  if (instances.length <= 1) return instances;
  const connected = instances.filter((instance) => instance.status === "connected");
  return connected.length === 1 ? connected : [];
}

function normalizeInboxPhone(value?: string | null) {
  const digits = String(value || "").replace(/\D/g, "");
  const nationalNumber = digits.startsWith("55") && [12, 13].includes(digits.length)
    ? digits.slice(2)
    : digits;
  return nationalNumber.length === 11 ? nationalNumber : "";
}
