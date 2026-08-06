import { NextRequest, NextResponse } from "next/server";
import { findAvailablePublicTestLink, publicTestTokenFromRequest, PublicAiTestError } from "@/lib/ai-public-test";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, context: { params: Promise<{ token: string }> }) {
  try {
    const { token: routeToken } = await context.params;
    const token = publicTestTokenFromRequest(req, routeToken);
    const link = await findAvailablePublicTestLink(token, { allowReplyLimitReached: true });
    return NextResponse.json({
      test: {
        title: link.title,
        unit: link.unit,
        runtimeVersion: link.runtimeVersion,
        campaign: link.campaign,
        expiresAt: link.expiresAt,
        maxRepliesPerSession: link.maxRepliesPerSession,
        remainingReplies: Math.max(0, link.maxTotalReplies - link.replyCount),
      },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error: unknown) {
    const known = error instanceof PublicAiTestError ? error : null;
    return NextResponse.json(
      { error: known?.message || "Não foi possível carregar o teste." },
      { status: known?.status || 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
