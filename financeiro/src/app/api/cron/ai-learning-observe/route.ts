import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { observeAiLearningBatch } from "@/lib/ai-learning/observer";
import { AiLearningError } from "@/lib/ai-learning/policy";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function validCronAuthorization(value: string | null) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const digest = (input: string) => createHash("sha256").update(input).digest();
  return timingSafeEqual(digest(value || ""), digest(`Bearer ${secret}`));
}

export async function POST(req: Request) {
  if (!validCronAuthorization(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  try {
    const result = await observeAiLearningBatch();
    console.info("[AI Learning] Lote supervisionado processado", result);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof AiLearningError) {
      console.error("[AI Learning] Lote não concluído", error.message);
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[AI Learning] Falha inesperada no lote");
    return NextResponse.json({ error: "Falha ao processar aprendizado" }, { status: 500 });
  }
}
