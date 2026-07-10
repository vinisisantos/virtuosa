import { NextRequest, NextResponse } from "next/server";
import { getUserFromHeaders } from "@/lib/auth";
import { developGuidedAiShadowResponse } from "@/lib/ai-shadow";

function canDevelopResponse(req: NextRequest) {
  const user = getUserFromHeaders(req);
  if (!user) return { allowed: false, response: NextResponse.json({ error: "Não autorizado" }, { status: 401 }) };
  if (user.isAdmin || user.permissions?.crmSilentAnalysis === true) return { allowed: true };
  return { allowed: false, response: NextResponse.json({ error: "Sem permissão para usar a IA" }, { status: 403 }) };
}

export async function POST(req: NextRequest) {
  try {
    const auth = canDevelopResponse(req);
    if (!auth.allowed) return auth.response;

    const body = await req.json().catch(() => ({}));
    const runId = typeof body.runId === "string" ? body.runId.trim() : "";
    const guidance = typeof body.guidance === "string" ? body.guidance.trim() : "";

    if (!runId) return NextResponse.json({ error: "runId obrigatório" }, { status: 400 });
    if (guidance.length < 3) return NextResponse.json({ error: "Escreva uma orientação para a IA desenvolver." }, { status: 400 });
    if (guidance.length > 1200) return NextResponse.json({ error: "A orientação deve ter no máximo 1.200 caracteres." }, { status: 400 });

    const result = await developGuidedAiShadowResponse(runId, guidance);
    if (!result) return NextResponse.json({ error: "Avaliação não encontrada" }, { status: 404 });

    return NextResponse.json({ result });
  } catch (error: any) {
    console.error("[POST /api/crm/ai-shadow/develop]", error);
    return NextResponse.json({ error: "Falha ao desenvolver a resposta", details: error?.message }, { status: 500 });
  }
}
