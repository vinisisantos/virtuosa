import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getUserFromHeaders } from "@/lib/auth";
import {
  findAiTrainingDiagramV6Campaign,
  listAiTrainingDiagramV6Campaigns,
  selectRandomAiTrainingDiagramV6Campaign,
  selectRandomApprovedCampaignCreative,
} from "@/lib/ai-campaign-simulation";
import {
  AI_TRAINING_DIAGRAM_V6_RUNTIME,
  aiTrainingDiagramV6MessageAudit,
  createAiTrainingDiagramV6Simulation,
} from "@/lib/ai-training-diagram-v6";
import {
  AI_TRAINING_DIAGRAM_V7_RUNTIME,
  aiTrainingDiagramV7MessageAudit,
  createAiTrainingDiagramV7Simulation,
  type AiTrainingDiagramV7State,
} from "@/lib/ai-training-diagram-v7";
import type { AiTrainingDiagramV6State } from "@/lib/ai-training-diagram-v6";
import { canAccessAiTrainingUnit, canUseAiTraining, visibleAiTrainingUnits } from "@/lib/ai-training";
import { prisma } from "@/lib/db";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : undefined;
}

function runtimeVersion(value: unknown) {
  if (value === AI_TRAINING_DIAGRAM_V6_RUNTIME) return AI_TRAINING_DIAGRAM_V6_RUNTIME;
  if (value === AI_TRAINING_DIAGRAM_V7_RUNTIME) return AI_TRAINING_DIAGRAM_V7_RUNTIME;
  return "current";
}

function isDiagramRuntime(value: string) {
  return value === AI_TRAINING_DIAGRAM_V6_RUNTIME || value === AI_TRAINING_DIAGRAM_V7_RUNTIME;
}

export async function GET(req: NextRequest) {
  try {
    const user = getUserFromHeaders(req);
    if (!canUseAiTraining(user)) return NextResponse.json({ error: "Sem permissão para usar o treinamento da IA" }, { status: user ? 403 : 401 });
    const allowedUnits = visibleAiTrainingUnits(user!);
    const searchParams = new URL(req.url).searchParams;
    const requestedUnit = searchParams.get("unit");
    const requestedRuntime = runtimeVersion(searchParams.get("runtimeVersion"));
    if (requestedUnit && !canAccessAiTrainingUnit(user!, requestedUnit)) {
      return NextResponse.json({ error: "Sem acesso a esta unidade" }, { status: 403 });
    }

    const conversations = await prisma.aiTrainingConversation.findMany({
      where: {
        archived: false,
        runtimeVersion: requestedRuntime,
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
        campaign: {
          select: { id: true, name: true, status: true },
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

    const campaigns = isDiagramRuntime(requestedRuntime) && allowedUnits.includes("Osasco")
      ? await listAiTrainingDiagramV6Campaigns("Osasco")
      : [];

    return NextResponse.json({ conversations, campaigns, allowedUnits, isAdmin: user!.isAdmin });
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
    const requestedRuntime = runtimeVersion(body.runtimeVersion);
    if (!canAccessAiTrainingUnit(user!, unit)) {
      return NextResponse.json({ error: "Selecione uma unidade permitida" }, { status: 403 });
    }

    if (isDiagramRuntime(requestedRuntime)) {
      if (unit !== "Osasco") {
        return NextResponse.json({ error: "A V6 Diagrama está restrita à unidade Osasco nesta fase" }, { status: 400 });
      }
      const selectionMode = body.selectionMode === "random" ? "random" : "manual";
      const campaignId = typeof body.campaignId === "string" ? body.campaignId.trim().slice(0, 120) : "";
      const campaign = selectionMode === "random"
        ? await selectRandomAiTrainingDiagramV6Campaign(unit)
        : campaignId
          ? await findAiTrainingDiagramV6Campaign(unit, campaignId)
          : null;
      if (!campaign) {
        return NextResponse.json({
          error: selectionMode === "random"
            ? "Não há campanha ativa de Osasco disponível para sorteio"
            : "Selecione uma campanha cadastrada em Osasco",
        }, { status: 409 });
      }

      const unitKnowledge = await prisma.aiUnitKnowledge.findUnique({
        where: { unit },
        select: { address: true },
      });
      const simulation = requestedRuntime === AI_TRAINING_DIAGRAM_V7_RUNTIME
        ? createAiTrainingDiagramV7Simulation({ campaign, unitAddress: unitKnowledge?.address })
        : createAiTrainingDiagramV6Simulation({ campaign, unitAddress: unitKnowledge?.address });
      const createdAt = Date.now();
      const conversation = await prisma.$transaction(async (tx) => {
        const created = await tx.aiTrainingConversation.create({
          data: {
            unit,
            runtimeVersion: requestedRuntime,
            title: campaign.name,
            campaignId: campaign.id,
            campaignCreativeId: campaign.creativeId,
            conversationState: simulation.state as unknown as Prisma.InputJsonValue,
            createdById: user!.userId,
            createdByName: user!.name || user!.email,
          },
          select: { id: true, unit: true, title: true, campaignId: true },
        });
        await tx.aiTrainingMessage.createMany({
          data: simulation.messages.map((message, index) => ({
            conversationId: created.id,
            role: "assistant",
            content: message.content,
            model: requestedRuntime === AI_TRAINING_DIAGRAM_V7_RUNTIME ? "deterministic:diagram-v7" : "deterministic:diagram-v6",
            guardrailFlags: [requestedRuntime === AI_TRAINING_DIAGRAM_V7_RUNTIME ? "diagram_v7_initial_script" : "diagram_v6_initial_script"],
            sdrAudit: (requestedRuntime === AI_TRAINING_DIAGRAM_V7_RUNTIME
              ? aiTrainingDiagramV7MessageAudit({ state: simulation.state as AiTrainingDiagramV7State, mediaKey: message.mediaKey })
              : aiTrainingDiagramV6MessageAudit({ state: simulation.state as AiTrainingDiagramV6State, mediaKey: message.mediaKey })) as Prisma.InputJsonValue,
            createdById: user!.userId,
            createdByName: user!.name || user!.email,
            createdAt: new Date(createdAt + index),
          })),
        });
        return created;
      });
      return NextResponse.json({ conversation, campaign, selectionMode }, { status: 201 });
    }

    const selectedCreative = await selectRandomApprovedCampaignCreative(unit);

    const conversation = await prisma.aiTrainingConversation.create({
      data: {
        unit,
        runtimeVersion: "current",
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
