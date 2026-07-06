import { NextRequest, NextResponse } from "next/server";
import { getUserFromHeaders } from "@/lib/auth";
import { processAiShadowRuns } from "@/lib/ai-shadow";

function canProcess(req: NextRequest) {
  const user = getUserFromHeaders(req);
  if (!user) return { allowed: false, response: NextResponse.json({ error: "Não autorizado" }, { status: 401 }) };
  if (user.isAdmin || user.permissions?.crmSilentAnalysis === true) return { allowed: true, user };
  return { allowed: false, response: NextResponse.json({ error: "Sem permissão para processar sombra IA" }, { status: 403 }) };
}

export async function POST(req: NextRequest) {
  try {
    const auth = canProcess(req);
    if (!auth.allowed) return auth.response;
    const body = await req.json().catch(() => ({}));
    const limit = Math.max(1, Math.min(25, Number(body.limit || 10)));
    const result = await processAiShadowRuns(limit);
    return NextResponse.json(result);
  } catch (error: any) {
    console.error("[POST /api/crm/ai-shadow/process]", error);
    return NextResponse.json({ error: "Falha ao processar rascunhos sombra", details: error?.message }, { status: 500 });
  }
}

