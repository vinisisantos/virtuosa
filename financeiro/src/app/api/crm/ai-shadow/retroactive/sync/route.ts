import { NextRequest, NextResponse } from "next/server";
import { getUserFromHeaders } from "@/lib/auth";
import { syncRetroactiveAiShadowBatches } from "@/lib/ai-shadow-retroactive";

function canSync(req: NextRequest) {
  const user = getUserFromHeaders(req);
  if (!user) return { allowed: false, response: NextResponse.json({ error: "Não autorizado" }, { status: 401 }) };
  if (user.isAdmin || user.permissions?.crmSilentAnalysis === true) return { allowed: true, user };
  return { allowed: false, response: NextResponse.json({ error: "Sem permissão para sincronizar lotes IA" }, { status: 403 }) };
}

export async function POST(req: NextRequest) {
  try {
    const auth = canSync(req);
    if (!auth.allowed) return auth.response;
    const body = await req.json().catch(() => ({}));
    const result = await syncRetroactiveAiShadowBatches(Number(body.limit || 5));
    return NextResponse.json(result);
  } catch (error: any) {
    console.error("[POST /api/crm/ai-shadow/retroactive/sync]", error);
    return NextResponse.json({ error: "Falha ao sincronizar lotes retroativos", details: error?.message }, { status: 500 });
  }
}
