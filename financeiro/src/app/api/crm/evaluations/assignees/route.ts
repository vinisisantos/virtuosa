import { NextRequest, NextResponse } from "next/server";

import { getEvaluationAssigneeUsers } from "@/lib/evaluation-scheduling";
import { requireUnitGuard, UnitAccessDeniedError, unitAccessDeniedResponse } from "@/lib/unit-guard";

export async function GET(req: NextRequest) {
  const requestedUnit = new URL(req.url).searchParams.get("unit");
  const guard = requireUnitGuard(req, { requestedUnit });
  if (guard instanceof NextResponse) return guard;

  const unit = guard.unitFilter || requestedUnit || guard.userUnit;
  if (!unit) {
    return NextResponse.json({ assignees: [] });
  }

  try {
    guard.enforceUnit(unit);
  } catch (error) {
    if (error instanceof UnitAccessDeniedError) return unitAccessDeniedResponse();
    throw error;
  }

  const users = await getEvaluationAssigneeUsers(unit);
  return NextResponse.json({
    unit,
    assignees: users.map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      unit: user.unit,
    })),
  });
}
