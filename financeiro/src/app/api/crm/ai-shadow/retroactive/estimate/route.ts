import { NextRequest, NextResponse } from "next/server";
import { getUserFromHeaders } from "@/lib/auth";
import { estimateRetroactiveAiShadow } from "@/lib/ai-shadow-retroactive";

function canUseRetroactive(req: NextRequest) {
  const user = getUserFromHeaders(req);
  if (!user) return { allowed: false, response: NextResponse.json({ error: "Não autorizado" }, { status: 401 }) };
  if (user.isAdmin || user.permissions?.crmSilentAnalysis === true) return { allowed: true, user };
  return { allowed: false, response: NextResponse.json({ error: "Sem permissão para modo retroativo IA" }, { status: 403 }) };
}

export async function POST(req: NextRequest) {
  try {
    const auth = canUseRetroactive(req);
    if (!auth.allowed) return auth.response;
    const body = await req.json().catch(() => ({}));
    const estimate = await estimateRetroactiveAiShadow({
      unit: body.unit || "Osasco",
      sampleSize: Number(body.sampleSize || 180),
      instanceIds: Array.isArray(body.instanceIds) ? body.instanceIds : undefined,
    });
    return NextResponse.json(estimate);
  } catch (error: any) {
    console.error("[POST /api/crm/ai-shadow/retroactive/estimate]", error);
    return NextResponse.json({ error: "Falha ao estimar lote retroativo", details: error?.message }, { status: 500 });
  }
}
