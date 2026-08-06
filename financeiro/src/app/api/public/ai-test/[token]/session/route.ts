import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import {
  AI_PUBLIC_TEST_MAX_SESSIONS_PER_IP_HOUR,
  assertPublicTestSameOrigin,
  createPublicSessionSecret,
  findAvailablePublicTestLink,
  findPublicTestSession,
  publicTestIpHash,
  publicTestSessionCookieFromRequest,
  publicTestSessionCookieName,
  publicTestTokenFromRequest,
  PublicAiTestError,
} from "@/lib/ai-public-test";
import {
  aiPublicDiagramV6InitialMessages,
  createAiPublicDiagramV6Simulation,
} from "@/lib/ai-public-diagram-v6";
import { AI_TRAINING_DIAGRAM_V6_RUNTIME } from "@/lib/ai-training-diagram-v6";
import { prisma } from "@/lib/db";

function sessionCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    maxAge: Math.max(60, Math.floor((expiresAt.getTime() - Date.now()) / 1000)),
    path: "/api/public/ai-test",
  };
}

export async function POST(req: NextRequest, context: { params: Promise<{ token: string }> }) {
  try {
    assertPublicTestSameOrigin(req);
    const { token: routeToken } = await context.params;
    const token = publicTestTokenFromRequest(req, routeToken);
    const link = await findAvailablePublicTestLink(token, { allowReplyLimitReached: true });
    const existing = await findPublicTestSession(req, link.id);
    if (existing) {
      const response = NextResponse.json({ sessionReady: true, repliesUsed: existing.replyCount });
      const sessionCookie = publicTestSessionCookieFromRequest(req, link.id);
      if (sessionCookie?.legacy) {
        response.cookies.set(
          publicTestSessionCookieName(link.id),
          sessionCookie.value,
          sessionCookieOptions(link.expiresAt),
        );
      }
      return response;
    }
    if (link.replyCount >= link.maxTotalReplies) {
      throw new PublicAiTestError("O limite de respostas deste teste foi atingido.", 429, "link_reply_limit");
    }
    let diagramSimulation: Awaited<ReturnType<typeof createAiPublicDiagramV6Simulation>> | null = null;
    if (link.runtimeVersion === AI_TRAINING_DIAGRAM_V6_RUNTIME) {
      if (!link.campaignId) {
        throw new PublicAiTestError("A campanha deste link V6 não está mais disponível.", 409, "diagram_v6_campaign_missing");
      }
      diagramSimulation = await createAiPublicDiagramV6Simulation({
        unit: link.unit,
        campaignId: link.campaignId,
      }).catch(() => {
        throw new PublicAiTestError("A campanha deste link V6 não está mais disponível.", 409, "diagram_v6_campaign_missing");
      });
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
      const created = await tx.aiPublicTestSession.create({
        data: {
          linkId: link.id,
          secretHash: generated.secretHash,
          ipHash,
          conversationState: diagramSimulation
            ? diagramSimulation.state as unknown as Prisma.InputJsonValue
            : undefined,
        },
      });
      if (diagramSimulation) {
        await tx.aiPublicTestMessage.createMany({
          data: aiPublicDiagramV6InitialMessages({
            sessionId: created.id,
            simulation: diagramSimulation,
          }),
        });
      }
      return created;
    });

    const response = NextResponse.json({ sessionReady: true, repliesUsed: 0 }, { status: 201 });
    response.cookies.set(
      publicTestSessionCookieName(link.id),
      `${session.id}.${generated.secret}`,
      sessionCookieOptions(link.expiresAt),
    );
    return response;
  } catch (error: unknown) {
    const known = error instanceof PublicAiTestError ? error : null;
    console.error("[POST /api/public/ai-test/:token/session]", known ? known.code : error);
    return NextResponse.json({ error: known?.message || "Não foi possível iniciar o teste." }, { status: known?.status || 500 });
  }
}
