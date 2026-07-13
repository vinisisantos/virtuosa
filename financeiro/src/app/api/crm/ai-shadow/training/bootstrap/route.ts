import { NextRequest, NextResponse } from "next/server";
import { getUserFromHeaders } from "@/lib/auth";
import { importHistoricalTrainingMemory } from "@/lib/ai-training";

export const maxDuration = 60;

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : undefined;
}

export async function POST(req: NextRequest) {
  try {
    const user = getUserFromHeaders(req);
    if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    if (!user.isAdmin) return NextResponse.json({ error: "Somente administradores podem preparar a memória inicial" }, { status: 403 });
    const body = await req.json().catch(() => ({}));
    const unit = typeof body.unit === "string" ? body.unit : "";
    const result = await importHistoricalTrainingMemory({ unit, user });
    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error("[POST /api/crm/ai-shadow/training/bootstrap]", error);
    return NextResponse.json({ error: "Falha ao preparar memória inicial", details: errorMessage(error) }, { status: 500 });
  }
}
