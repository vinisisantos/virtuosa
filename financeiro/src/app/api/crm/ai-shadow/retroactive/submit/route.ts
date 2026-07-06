import { NextRequest, NextResponse } from "next/server";
import { getUserFromHeaders } from "@/lib/auth";
import { submitRetroactiveAiShadowBatch } from "@/lib/ai-shadow-retroactive";

function requireAdmin(req: NextRequest) {
  const user = getUserFromHeaders(req);
  if (!user) return { allowed: false, response: NextResponse.json({ error: "Não autorizado" }, { status: 401 }) };
  if (user.isAdmin) return { allowed: true, user };
  return { allowed: false, response: NextResponse.json({ error: "Apenas admin pode submeter lote retroativo" }, { status: 403 }) };
}

export async function POST(req: NextRequest) {
  try {
    const auth = requireAdmin(req);
    if (!auth.allowed) return auth.response;
    const user = auth.user!;
    const body = await req.json().catch(() => ({}));
    const result = await submitRetroactiveAiShadowBatch({
      unit: body.unit || "Osasco",
      sampleSize: Number(body.sampleSize || 180),
      instanceIds: Array.isArray(body.instanceIds) ? body.instanceIds : undefined,
      confirmedEstimatedCostUsd: Number(body.confirmedEstimatedCostUsd || 0),
      submittedBy: user.name || user.email || user.userId,
    });
    return NextResponse.json(result);
  } catch (error: any) {
    console.error("[POST /api/crm/ai-shadow/retroactive/submit]", error);
    return NextResponse.json({ error: "Falha ao submeter lote retroativo", details: error?.message }, { status: 500 });
  }
}
