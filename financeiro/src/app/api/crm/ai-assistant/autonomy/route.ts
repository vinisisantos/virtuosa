import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { requireAliceAuthorizedUser } from "@/lib/ai-assistant/access";
import { AiAssistantError } from "@/lib/ai-assistant/policy";
import { getAliceAutonomyMonitoring, retryAliceFailedTurn, setAliceAutonomyEnabled } from "@/lib/ai-assistant/autonomy/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

async function requireAdmin(req: NextRequest) {
  const auth = await requireRole(req, ["ADMINISTRADOR"]);
  if ("error" in auth) throw new AiAssistantError("Acesso administrativo necessário.", auth.error.status);
  requireAliceAuthorizedUser(auth.user.userId);
  if (req.nextUrl.searchParams.has("unit") && req.nextUrl.searchParams.get("unit") !== "SBC") throw new AiAssistantError("O acompanhamento da Alice está disponível somente em SBC.", 403);
  return auth.user;
}
function errorResponse(error: unknown) {
  if (error instanceof AiAssistantError) return NextResponse.json({ error: error.message }, { status: error.status });
  console.error("[AliceAutonomy] administrative action unavailable");
  return NextResponse.json({ error: "Não foi possível atualizar o acompanhamento da Alice. Tente novamente." }, { status: 500 });
}
export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    return NextResponse.json(await getAliceAutonomyMonitoring({ days: Number(req.nextUrl.searchParams.get("days") || "7"), cursor: req.nextUrl.searchParams.get("cursor") }),
      { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return errorResponse(error); }
}
export async function PATCH(req: NextRequest) {
  try {
    const user = await requireAdmin(req);
    const input = await req.json().catch(() => { throw new AiAssistantError("Configuração inválida.", 400); });
    if (input?.action === "retry_turn") {
      if (typeof input.turnId !== "string") throw new AiAssistantError("Atendimento inválido.", 400);
      return NextResponse.json(await retryAliceFailedTurn(input.turnId, user), { headers: { "Cache-Control": "private, no-store" } });
    }
    return NextResponse.json(await setAliceAutonomyEnabled(input, user), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return errorResponse(error); }
}
