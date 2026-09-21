import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { aiLearningErrorResponse, requireAiLearningAdmin, reviewAiLearningCandidate } from "@/lib/ai-learning/review";
import {
  AI_LEARNING_CONFIG_KEY,
  AI_LEARNING_UNIT,
  AiLearningError,
  aiLearningDayKey,
  parseAiLearningConfig,
} from "@/lib/ai-learning/policy";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    await requireAiLearningAdmin(req);
    const params = req.nextUrl.searchParams;
    const status = params.get("status") || "pending";
    if (!new Set(["pending", "approved", "rejected"]).has(status)) {
      throw new AiLearningError("Filtro inválido");
    }
    const cursor = params.get("cursor") || undefined;
    const today = new Date(`${aiLearningDayKey()}T00:00:00-03:00`);
    const [items, pending, approved, rejected, queued, failed, operations, setting] = await Promise.all([
      prisma.aiLearningCandidate.findMany({
        where: { unit: AI_LEARNING_UNIT, status },
        select: {
          id: true,
          content: true,
          status: true,
          version: true,
          sourceConversationId: true,
          sourceMessageIds: true,
          reviewedBy: true,
          reviewedAt: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        take: 31,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      }),
      prisma.aiLearningCandidate.count({ where: { unit: AI_LEARNING_UNIT, status: "pending" } }),
      prisma.aiLearningCandidate.count({ where: { unit: AI_LEARNING_UNIT, status: "approved" } }),
      prisma.aiLearningCandidate.count({ where: { unit: AI_LEARNING_UNIT, status: "rejected" } }),
      prisma.aiLearningObservation.count({
        where: { unit: AI_LEARNING_UNIT, revision: { gt: prisma.aiLearningObservation.fields.processedRevision } },
      }),
      prisma.aiLearningObservation.count({
        where: {
          unit: AI_LEARNING_UNIT,
          attempts: { gte: 3 },
          revision: { gt: prisma.aiLearningObservation.fields.processedRevision },
        },
      }),
      prisma.aiLearningOperation.aggregate({
        where: { unit: AI_LEARNING_UNIT, createdAt: { gte: today } },
        _sum: { reservedMicroUsd: true, actualMicroUsd: true },
        _count: { _all: true },
      }),
      prisma.appSetting.findUnique({ where: { key: AI_LEARNING_CONFIG_KEY }, select: { value: true } }),
    ]);
    const hasMore = items.length > 30;
    const visibleItems = hasMore ? items.slice(0, 30) : items;
    return NextResponse.json({
      items: visibleItems,
      nextCursor: hasMore ? visibleItems.at(-1)?.id || null : null,
      summary: {
        pending,
        approved,
        rejected,
        queued,
        failed,
        batchesToday: operations._count._all,
        reservedMicroUsdToday: operations._sum.reservedMicroUsd || 0,
        actualMicroUsdToday: operations._sum.actualMicroUsd || 0,
      },
      config: parseAiLearningConfig(setting?.value),
    });
  } catch (error) {
    return aiLearningErrorResponse(error);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const input = await req.json();
    return NextResponse.json(await reviewAiLearningCandidate(req, input));
  } catch (error) {
    return aiLearningErrorResponse(error);
  }
}
