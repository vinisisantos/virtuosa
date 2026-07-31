import { randomInt } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getUserFromHeaders } from "@/lib/auth";
import { canAccessAiTrainingUnit, canUseAiTraining, visibleAiTrainingUnits } from "@/lib/ai-training";
import { prisma } from "@/lib/db";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : undefined;
}

function campaignNameKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export async function GET(req: NextRequest) {
  try {
    const user = getUserFromHeaders(req);
    if (!canUseAiTraining(user)) return NextResponse.json({ error: "Sem permissão para usar o treinamento da IA" }, { status: user ? 403 : 401 });
    const allowedUnits = visibleAiTrainingUnits(user!);
    const requestedUnit = new URL(req.url).searchParams.get("unit");
    if (requestedUnit && !canAccessAiTrainingUnit(user!, requestedUnit)) {
      return NextResponse.json({ error: "Sem acesso a esta unidade" }, { status: 403 });
    }

    const conversations = await prisma.aiTrainingConversation.findMany({
      where: {
        archived: false,
        unit: requestedUnit ? requestedUnit : { in: allowedUnits },
      },
      select: {
        id: true,
        unit: true,
        title: true,
        createdById: true,
        createdByName: true,
        replyDueAt: true,
        replyStatus: true,
        createdAt: true,
        updatedAt: true,
        campaignCreative: {
          select: {
            id: true,
            label: true,
            campaign: { select: { name: true } },
          },
        },
        _count: { select: { messages: true } },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { content: true, role: true, createdAt: true },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 50,
    });

    return NextResponse.json({ conversations, allowedUnits, isAdmin: user!.isAdmin });
  } catch (error: unknown) {
    console.error("[GET /api/crm/ai-shadow/training/conversations]", error);
    return NextResponse.json({ error: "Falha ao carregar chats internos", details: errorMessage(error) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = getUserFromHeaders(req);
    if (!canUseAiTraining(user)) return NextResponse.json({ error: "Sem permissão para usar o treinamento da IA" }, { status: user ? 403 : 401 });
    const body = await req.json().catch(() => ({}));
    const unit = typeof body.unit === "string" ? body.unit : "";
    if (!canAccessAiTrainingUnit(user!, unit)) {
      return NextResponse.json({ error: "Selecione uma unidade permitida" }, { status: 403 });
    }

    const approvedCreatives = await prisma.aiTrainingCampaignCreative.findMany({
      where: {
        unit,
        status: "approved",
        campaign: { is: { unit } },
        OR: [{ validUntil: null }, { validUntil: { gte: new Date() } }],
      },
      orderBy: [{ approvedAt: "desc" }, { updatedAt: "desc" }],
      take: 100,
      select: {
        id: true,
        campaign: { select: { name: true } },
      },
    });
    const selectedCampaignNames = new Set<string>();
    const campaignChoices = approvedCreatives.filter((creative) => {
      const key = campaignNameKey(creative.campaign.name);
      if (!key || selectedCampaignNames.has(key)) return false;
      selectedCampaignNames.add(key);
      return true;
    });
    const selectedCreative = campaignChoices.length > 0
      ? campaignChoices[randomInt(campaignChoices.length)]
      : null;

    const conversation = await prisma.aiTrainingConversation.create({
      data: {
        unit,
        title: "Nova simulação",
        campaignCreativeId: selectedCreative?.id || null,
        createdById: user!.userId,
        createdByName: user!.name || user!.email,
      },
      select: {
        id: true,
        unit: true,
        title: true,
        campaignCreative: {
          select: {
            id: true,
            label: true,
            campaign: { select: { name: true } },
          },
        },
      },
    });
    return NextResponse.json({ conversation }, { status: 201 });
  } catch (error: unknown) {
    console.error("[POST /api/crm/ai-shadow/training/conversations]", error);
    return NextResponse.json({ error: "Falha ao criar chat interno", details: errorMessage(error) }, { status: 500 });
  }
}
