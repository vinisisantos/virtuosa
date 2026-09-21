import { NextResponse } from "next/server";
import { AiAssistantError } from "@/lib/ai-assistant/policy";

export function aiAssistantErrorResponse(error: unknown) {
  if (error instanceof AiAssistantError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  console.error("[AI Assistant] Falha não tratada", error);
  return NextResponse.json({ error: "Não foi possível concluir a ação da IA" }, { status: 500 });
}
