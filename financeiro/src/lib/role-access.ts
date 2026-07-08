export function normalizeRole(role?: string | null) {
  return (role || "").trim().toUpperCase();
}

export function isAdminRole(role?: string | null) {
  return normalizeRole(role) === "ADMINISTRADOR";
}

export function isMarketingRole(role?: string | null) {
  return normalizeRole(role) === "MARKETING";
}

export function canViewCollaboratorWhatsApp(role?: string | null) {
  return isAdminRole(role) || isMarketingRole(role);
}

export function canManageCollaboratorWhatsApp(role?: string | null) {
  return isAdminRole(role);
}

export const UNIT_PERMISSION_MAP: Record<string, string> = {
  unitOsasco: 'Osasco',
  unitSBC: 'SBC',
  unitSCS: 'SCS',
  unitBarueri: 'Barueri',
};

export const ALL_VISIBLE_UNITS = ['Osasco', 'SBC', 'SCS', 'Barueri'];

export function permittedUnitsForAccess(params: {
  role?: string | null;
  userUnit?: string | null;
  permissions?: Record<string, boolean> | null;
}) {
  const permissions = params.permissions || {};
  if (isAdminRole(params.role) || permissions.admin || permissions.multiUnit) {
    return [...ALL_VISIBLE_UNITS];
  }

  const units = new Set<string>();
  if (params.userUnit) units.add(params.userUnit);
  for (const [permissionKey, unitName] of Object.entries(UNIT_PERMISSION_MAP)) {
    if (permissions[permissionKey]) units.add(unitName);
  }
  return [...units];
}
