import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { loadAliceAutonomyConfig } from "@/lib/ai-assistant/autonomy/config";
import { aliceAutonomySummaryQuery } from "@/lib/ai-assistant/autonomy/admin-queries";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const REPORT_WINDOW_MS = 24 * 60 * 60 * 1000;
const MINIMUM_TOKEN_LENGTH = 32;

function isAuthorized(authorization: string | null) {
  const token = process.env.OPENMAUSBOT_SBC_REPORT_TOKEN?.trim();
  if (!token || token.length < MINIMUM_TOKEN_LENGTH) return false;

  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(authorization || ""), digest(`Bearer ${token}`));
}

export async function GET(req: Request) {
  const token = process.env.OPENMAUSBOT_SBC_REPORT_TOKEN?.trim();
  if (!token || token.length < MINIMUM_TOKEN_LENGTH) {
    return NextResponse.json({ error: "Integração indisponível." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  if (!isAuthorized(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }

  try {
    const generatedAt = new Date();
    const since = new Date(generatedAt.getTime() - REPORT_WINDOW_MS);
    const [config, summaries] = await Promise.all([
      loadAliceAutonomyConfig(),
      prisma.$queryRaw<Record<string, number>[]>(aliceAutonomySummaryQuery(since)),
    ]);
    const summary = summaries[0];

    return NextResponse.json({
      generatedAt: generatedAt.toISOString(),
      period: { from: since.toISOString(), to: generatedAt.toISOString(), hours: 24 },
      unit: "SBC",
      assistant: { name: "Alice", enabled: config.enabled },
      metrics: {
        conversations: summary.conversations,
        queued: summary.queued,
        sent: summary.sent,
        uncertain: summary.uncertain,
        failed: summary.failed,
        needsHuman: summary.needsHuman,
        appointments: summary.appointments,
        inputTokens: summary.inputTokens,
        outputTokens: summary.outputTokens,
        cacheReadInputTokens: summary.cacheReadInputTokens,
        cacheCreationInputTokens: summary.cacheCreationInputTokens,
        costMicroUsd: summary.costMicroUsd,
        unknownCostTurns: summary.unknownCostTurns,
        backlogTurns: summary.backlogTurns,
        averageGenerationMs: summary.averageGenerationMs,
        averageResponseMs: summary.averageResponseMs,
        averageBacklogResponseMs: summary.averageBacklogResponseMs,
      },
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    console.error("[OpenMausBot Alice report] Falha ao gerar resumo agregado de SBC.");
    return NextResponse.json({ error: "Não foi possível gerar o relatório." }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
