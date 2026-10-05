import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { requireAliceOwner } from "@/lib/ai-assistant/access";
import { prisma } from "@/lib/db";
import { loadAiAssistantConfig } from "@/lib/ai-assistant/config";
import { getAliceKnowledgeStatus } from "@/lib/ai-assistant/alice-knowledge";
import { aliceRuntimeStatus } from "@/lib/ai-assistant/runtime";
import { aiAssistantErrorResponse } from "@/lib/ai-assistant/http";
import {
  AI_ASSISTANT_CONFIG_KEY,
  ALICE_ALLOWED_UNITS,
  AiAssistantError,
  aiAssistantDayKey,
  aiAssistantPublicConfig,
  validateAiAssistantConfigInput,
} from "@/lib/ai-assistant/policy";

export const dynamic = "force-dynamic";

async function requireAdmin(req: NextRequest) {
  const auth = await requireRole(req, ["ADMINISTRADOR"]);
  if ("error" in auth) throw new AiAssistantError("Acesso administrativo necessário", auth.error.status);
  requireAliceOwner(auth.user.userId);
  return auth.user;
}
export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    const today = new Date(`${aiAssistantDayKey()}T00:00:00-03:00`);
    const [config, usage, budgetSetting] = await Promise.all([
      loadAiAssistantConfig(),
      prisma.aiAssistantOperation.aggregate({
        where: { unit: { in: [...ALICE_ALLOWED_UNITS] }, createdAt: { gte: today } },
        _count: { _all: true },
        _sum: { actualMicroUsd: true, reservedMicroUsd: true },
      }),
      prisma.appSetting.findUnique({
        where: { key: `${AI_ASSISTANT_CONFIG_KEY}:budget:${aiAssistantDayKey()}` },
        select: { value: true },
      }),
    ]);
    let budget = { reserved: 0, requests: 0 };
    try {
      budget = budgetSetting ? JSON.parse(budgetSetting.value) : budget;
    } catch {}
    return NextResponse.json({
      config: aiAssistantPublicConfig(config),
      knowledge: getAliceKnowledgeStatus(),
      runtime: aliceRuntimeStatus(),
      usage: {
        requestsToday: budget.requests || usage._count._all,
        reservedMicroUsdToday: budget.reserved || usage._sum.reservedMicroUsd || 0,
        actualMicroUsdToday: usage._sum.actualMicroUsd || 0,
      },
    });
  } catch (error) {
    return aiAssistantErrorResponse(error);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    await requireAdmin(req);
    const current = await loadAiAssistantConfig();
    const config = validateAiAssistantConfigInput(await req.json(), current);
    await prisma.appSetting.upsert({
      where: { key: AI_ASSISTANT_CONFIG_KEY },
      create: { key: AI_ASSISTANT_CONFIG_KEY, value: JSON.stringify(config) },
      update: { value: JSON.stringify(config) },
    });
    return NextResponse.json({ config: aiAssistantPublicConfig(config) });
  } catch (error) {
    return aiAssistantErrorResponse(error);
  }
}
