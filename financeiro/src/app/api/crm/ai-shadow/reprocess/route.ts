import { NextRequest, NextResponse } from "next/server";
import { getUserFromHeaders } from "@/lib/auth";
import { processAiShadowRunById } from "@/lib/ai-shadow";

function canReprocess(req: NextRequest) {
  const user = getUserFromHeaders(req);
  if (!user) return { allowed: false, response: NextResponse.json({ error: "Não autorizado" }, { status: 401 }) };
  if (user.isAdmin || user.permissions?.crmSilentAnalysis === true) return { allowed: true, user };
  return { allowed: false, response: NextResponse.json({ error: "Sem permissão para reprocessar IA" }, { status: 403 }) };
}

export async function POST(req: NextRequest) {
  try {
    const auth = canReprocess(req);
    if (!auth.allowed) return auth.response;
    const body = await req.json().catch(() => ({}));
    const runId = typeof body.runId === "string" ? body.runId : "";
    if (!runId) return NextResponse.json({ error: "runId obrigatório" }, { status: 400 });

    const result = await processAiShadowRunById(runId);
    return NextResponse.json(result);
  } catch (error: any) {
    console.error("[POST /api/crm/ai-shadow/reprocess]", error);
    return NextResponse.json({ error: "Falha ao reprocessar comparativo", details: error?.message }, { status: 500 });
  }
}
