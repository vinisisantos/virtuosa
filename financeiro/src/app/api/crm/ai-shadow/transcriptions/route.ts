import { NextRequest, NextResponse } from "next/server";
import { getUserFromHeaders } from "@/lib/auth";
import { processPendingAudioTranscriptions } from "@/lib/ai-shadow-transcription";

function canManage(req: NextRequest) {
  const user = getUserFromHeaders(req);
  if (!user) return { allowed: false, response: NextResponse.json({ error: "Não autorizado" }, { status: 401 }) };
  if (user.isAdmin || user.permissions?.crmSilentAnalysis === true) return { allowed: true, user };
  return { allowed: false, response: NextResponse.json({ error: "Sem permissão para transcrever áudios IA" }, { status: 403 }) };
}

export async function POST(req: NextRequest) {
  try {
    const auth = canManage(req);
    if (!auth.allowed) return auth.response;
    const body = await req.json().catch(() => ({}));
    const unit = body.unit === "Osasco" ? "Osasco" : "Osasco";
    const limit = Math.max(1, Math.min(20, Number(body.limit || 8)));
    const result = await processPendingAudioTranscriptions({ unit, limit });
    return NextResponse.json(result);
  } catch (error: any) {
    console.error("[POST /api/crm/ai-shadow/transcriptions]", error);
    return NextResponse.json({ error: "Falha ao transcrever áudios", details: error?.message }, { status: 500 });
  }
}
