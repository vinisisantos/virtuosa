import type { UnitGuardResult } from "@/lib/unit-guard";

export function canViewCrmStatistics(guard: UnitGuardResult) {
  return (
    guard.isAdmin ||
    guard.userRole === "MARKETING" ||
    guard.permissions?.dashboard === true ||
    guard.permissions?.crmEstatistica === true
  );
}
