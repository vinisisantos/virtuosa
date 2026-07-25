import { NextRequest, NextResponse } from "next/server";
import {
  AI_PUBLIC_TEST_COOKIE,
  AI_PUBLIC_TEST_MAX_SESSIONS_PER_IP_HOUR,
  assertPublicTestSameOrigin,
  createPublicSessionSecret,
  findAvailablePublicTestLink,
  findPublicTestSession,
  publicTestIpHash,
  publicTestTokenFromRequest,
  PublicAiTestError,
} from "@/lib/ai-public-test";
import { prisma } from "@/lib/db";

export async function POST(req: NextRequest, context: { params: Promise<{ token: string }> }) {
  try {
    assertPublicTestSameOrigin(req);
    const { token: routeToken } = await context.params;
    const token = publicTestTokenFromRequest(req, routeToken);
    const link = await findAvailablePublicTestLink(token, { allowReplyLimitReached: true });
    const existing = await findPublicTestSession(req, link.id);
    if (existing) {
      return NextResponse.json({ sessionReady: true, repliesUsed: existing.replyCount });
    }
    if (link.replyCount >= link.maxTotalReplies) {
      throw new PublicAiTestError("O limite de respostas deste teste foi atingido.", 429, "link_reply_limit");
    }

    const ipHash = publicTestIpHash(req);
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentSessions = await prisma.aiPublicTestSession.count({
      where: { ipHash, createdAt: { gte: oneHourAgo } },
    });
    if (recentSessions >= AI_PUBLIC_TEST_MAX_SESSIONS_PER_IP_HOUR) {
      throw new PublicAiTestError("Muitas sessões de teste foram iniciadas. Tente novamente mais tarde.", 429, "ip_session_limit");
    }

    const generated = createPublicSessionSecret();
    const session = await prisma.$transaction(async (tx) => {
      const reserved = await tx.aiPublicTestLink.updateMany({
        where: {
          id: link.id,
          status: "active",
          revokedAt: null,
          expiresAt: { gt: new Date() },
          sessionCount: { lt: link.maxSessions },
        },
        data: { sessionCount: { increment: 1 } },
      });
      if (reserved.count === 0) {
        throw new PublicAiTestError("O limite de participantes deste teste foi atingido.", 429, "link_session_limit");
      }
      return tx.aiPublicTestSession.create({
        data: {
          linkId: link.id,
          secretHash: generated.secretHash,
          ipHash,
        },
      });
    });

    const maxAge = Math.max(60, Math.floor((link.expiresAt.getTime() - Date.now()) / 1000));
    const response = NextResponse.json({ sessionReady: true, repliesUsed: 0 }, { status: 201 });
    response.cookies.set(AI_PUBLIC_TEST_COOKIE, `${session.id}.${generated.secret}`, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge,
      path: "/api/public/ai-test",
    });
    return response;
  } catch (error: unknown) {
    const known = error instanceof PublicAiTestError ? error : null;
    console.error("[POST /api/public/ai-test/:token/session]", known ? known.code : error);
    return NextResponse.json({ error: known?.message || "Não foi possível iniciar o teste." }, { status: known?.status || 500 });
  }
}
