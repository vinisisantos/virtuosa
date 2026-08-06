import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getUserFromHeaders } from "@/lib/auth";
import { canUseAiTraining, visibleAiTrainingUnits } from "@/lib/ai-training";
import { AI_TRAINING_CADERNO_VERSION } from "@/lib/ai-training-caderno";
import { findAiTrainingDiagramV6Campaign } from "@/lib/ai-campaign-simulation";
import { AI_TRAINING_DIAGRAM_V6_RUNTIME } from "@/lib/ai-training-diagram-v6";
import {
  AI_PUBLIC_TEST_PROMPT_VERSION,
  createPublicTestToken,
  restorablePublicTestToken,
} from "@/lib/ai-public-test";
import { prisma } from "@/lib/db";

function integer(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : undefined;
}

function publicOrigin(req: NextRequest) {
  return (process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin).replace(/\/$/, "");
}

function runtimeVersion(value: unknown) {
  return value === AI_TRAINING_DIAGRAM_V6_RUNTIME ? AI_TRAINING_DIAGRAM_V6_RUNTIME : "current";
}

export async function GET(req: NextRequest) {
  try {
    const user = getUserFromHeaders(req);
    if (!canUseAiTraining(user)) {
      return NextResponse.json({ error: "Sem permissão para visualizar links de teste" }, { status: user ? 403 : 401 });
    }
    const units = visibleAiTrainingUnits(user!);
    const requestedRuntime = runtimeVersion(new URL(req.url).searchParams.get("runtimeVersion"));
    const now = new Date();
    const [links, approvedCampaignCreatives] = await Promise.all([
      prisma.aiPublicTestLink.findMany({
        where: { unit: { in: units }, runtimeVersion: requestedRuntime },
        select: {
          id: true,
          tokenHint: true,
          title: true,
          unit: true,
          status: true,
          runtimeVersion: true,
          campaignId: true,
          campaign: { select: { id: true, name: true, status: true } },
          campaignCreativeId: true,
          campaignCreative: {
            select: {
              id: true,
              label: true,
              unit: true,
              campaign: { select: { name: true } },
            },
          },
          includeExperimentalCaderno: true,
          knowledgeVersion: true,
          expiresAt: true,
          maxSessions: true,
          maxRepliesPerSession: true,
          maxTotalReplies: true,
          sessionCount: true,
          replyCount: true,
          createdByName: true,
          revokedAt: true,
          createdAt: true,
          updatedAt: true,
          _count: { select: { sessions: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 30,
      }),
      requestedRuntime === "current" ? prisma.aiTrainingCampaignCreative.findMany({
        where: {
          unit: { in: units },
          status: "approved",
          campaign: { is: { unit: { in: units } } },
          OR: [{ validUntil: null }, { validUntil: { gte: now } }],
        },
        select: {
          id: true,
          label: true,
          unit: true,
          campaign: { select: { name: true } },
        },
        orderBy: [{ unit: "asc" }, { approvedAt: "desc" }],
        take: 200,
      }) : Promise.resolve([]),
    ]);
    return NextResponse.json({
      links: links.map((link) => ({
        ...link,
        publicUrl: user!.isAdmin && link.runtimeVersion === AI_TRAINING_DIAGRAM_V6_RUNTIME
          ? `${publicOrigin(req)}/testar-ia/acesso#${restorablePublicTestToken(link.id).token}`
          : null,
      })),
      approvedCampaignCreatives,
      allowedUnits: units,
      isAdmin: user!.isAdmin,
    });
  } catch (error: unknown) {
    console.error("[GET /api/crm/ai-shadow/training/share-links]", error);
    return NextResponse.json({ error: "Falha ao carregar links públicos", details: errorMessage(error) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = getUserFromHeaders(req);
    if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    if (!user.isAdmin) return NextResponse.json({ error: "Somente administradores podem gerar links públicos" }, { status: 403 });
    const body = await req.json().catch(() => ({}));
    const allowedUnits = visibleAiTrainingUnits(user);
    const unit = typeof body.unit === "string" ? body.unit : "";
    const requestedRuntime = runtimeVersion(body.runtimeVersion);
    if (!allowedUnits.includes(unit)) return NextResponse.json({ error: "Unidade não permitida" }, { status: 403 });
    if (requestedRuntime === AI_TRAINING_DIAGRAM_V6_RUNTIME && unit !== "Osasco") {
      return NextResponse.json({ error: "A V6 Diagrama está restrita à unidade Osasco nesta fase" }, { status: 400 });
    }
    const requestedCampaignCreativeId = typeof body.campaignCreativeId === "string"
      ? body.campaignCreativeId.trim()
      : "";
    const requestedCampaignId = typeof body.campaignId === "string"
      ? body.campaignId.trim().slice(0, 120)
      : "";

    const campaignCreative = requestedRuntime === "current" && requestedCampaignCreativeId
      ? await prisma.aiTrainingCampaignCreative.findFirst({
          where: {
            id: requestedCampaignCreativeId,
            unit,
            status: "approved",
            campaign: { is: { unit } },
            OR: [{ validUntil: null }, { validUntil: { gte: new Date() } }],
          },
          select: { id: true },
        })
      : null;
    if (requestedCampaignCreativeId && !campaignCreative) {
      return NextResponse.json({ error: "Campanha aprovada não encontrada para esta unidade" }, { status: 400 });
    }
    const diagramCampaign = requestedRuntime === AI_TRAINING_DIAGRAM_V6_RUNTIME && requestedCampaignId
      ? await findAiTrainingDiagramV6Campaign(unit, requestedCampaignId)
      : null;
    if (requestedRuntime === AI_TRAINING_DIAGRAM_V6_RUNTIME && !diagramCampaign) {
      return NextResponse.json({ error: "Selecione uma campanha cadastrada em Osasco" }, { status: 400 });
    }

    const title = typeof body.title === "string" && body.title.trim()
      ? body.title.trim().slice(0, 100)
      : diagramCampaign ? `Teste V6 · ${diagramCampaign.name}` : "Teste da IA Virtuosa";
    const expiresInDays = integer(body.expiresInDays, 7, 1, 30);
    const maxSessions = integer(body.maxSessions, 100, 1, 1000);
    const maxRepliesPerSession = integer(body.maxRepliesPerSession, 20, 1, 50);
    const maxTotalReplies = integer(body.maxTotalReplies, 200, 1, 2000);
    const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);
    const id = randomUUID();
    const generated = requestedRuntime === AI_TRAINING_DIAGRAM_V6_RUNTIME
      ? restorablePublicTestToken(id)
      : createPublicTestToken();

    const link = await prisma.aiPublicTestLink.create({
      data: {
        id,
        tokenHash: generated.tokenHash,
        tokenHint: generated.tokenHint,
        title,
        unit,
        runtimeVersion: requestedRuntime,
        campaignId: diagramCampaign?.id || null,
        campaignCreativeId: campaignCreative?.id || null,
        includeExperimentalCaderno: requestedRuntime === "current" && body.includeExperimentalCaderno !== false,
        promptVersion: requestedRuntime === AI_TRAINING_DIAGRAM_V6_RUNTIME
          ? "diagram-v6-public-v1"
          : AI_PUBLIC_TEST_PROMPT_VERSION,
        knowledgeVersion: AI_TRAINING_CADERNO_VERSION,
        expiresAt,
        maxSessions,
        maxRepliesPerSession,
        maxTotalReplies,
        createdById: user.userId,
        createdByName: user.name || user.email,
      },
      select: {
        id: true,
        tokenHint: true,
        title: true,
        unit: true,
        status: true,
        runtimeVersion: true,
        campaignId: true,
        campaign: { select: { id: true, name: true, status: true } },
        campaignCreativeId: true,
        campaignCreative: {
          select: {
            id: true,
            label: true,
            unit: true,
            campaign: { select: { name: true } },
          },
        },
        includeExperimentalCaderno: true,
        knowledgeVersion: true,
        expiresAt: true,
        maxSessions: true,
        maxRepliesPerSession: true,
        maxTotalReplies: true,
        sessionCount: true,
        replyCount: true,
        createdByName: true,
        createdAt: true,
      },
    });

    return NextResponse.json({
      link,
      publicUrl: `${publicOrigin(req)}/testar-ia/acesso#${generated.token}`,
    }, { status: 201 });
  } catch (error: unknown) {
    console.error("[POST /api/crm/ai-shadow/training/share-links]", error);
    return NextResponse.json({ error: "Falha ao gerar link público", details: errorMessage(error) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = getUserFromHeaders(req);
    if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    if (!user.isAdmin) return NextResponse.json({ error: "Somente administradores podem encerrar links públicos" }, { status: 403 });
    const body = await req.json().catch(() => ({}));
    const id = typeof body.id === "string" ? body.id : "";
    if (!id) return NextResponse.json({ error: "Link obrigatório" }, { status: 400 });

    const link = await prisma.aiPublicTestLink.update({
      where: { id },
      data: { status: "revoked", revokedAt: new Date() },
      select: { id: true, status: true, revokedAt: true },
    });
    return NextResponse.json({ link });
  } catch (error: unknown) {
    console.error("[PATCH /api/crm/ai-shadow/training/share-links]", error);
    return NextResponse.json({ error: "Falha ao encerrar link público", details: errorMessage(error) }, { status: 500 });
  }
}
