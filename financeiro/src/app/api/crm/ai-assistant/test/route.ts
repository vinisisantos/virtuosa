import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { generateAiAssistantTest } from "@/lib/ai-assistant/generate";
import { aiAssistantErrorResponse } from "@/lib/ai-assistant/http";
import { AiAssistantError } from "@/lib/ai-assistant/policy";
import { sanitizeAiAssistantText } from "@/lib/ai-assistant/privacy";

export async function POST(req: NextRequest) {
  try {
    const auth = await requireRole(req, ["ADMINISTRADOR"]);
    if ("error" in auth) throw new AiAssistantError("Acesso administrativo necessário", auth.error.status);
    const body = await req.json();
    const input = sanitizeAiAssistantText(typeof body.input === "string" ? body.input : "");
    if (!input || input.length < 2) throw new AiAssistantError("Escreva uma mensagem para testar");
    return NextResponse.json(await generateAiAssistantTest({ input, userId: auth.user.userId }));
  } catch (error) {
    return aiAssistantErrorResponse(error);
  }
}
