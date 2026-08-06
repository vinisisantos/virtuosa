import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getUserFromHeaders } from "@/lib/auth";
import { canAccessAiTrainingUnit, canUseAiTraining } from "@/lib/ai-training";
import { AI_TRAINING_DIAGRAM_V6_RUNTIME } from "@/lib/ai-training-diagram-v6";
import { prisma } from "@/lib/db";
import { createPrivateBlobReadUrl } from "@/lib/whatsapp/media-storage";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : undefined;
}

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = getUserFromHeaders(req);
    if (!canUseAiTraining(user)) return NextResponse.json({ error: "Sem permissão para usar o treinamento da IA" }, { status: user ? 403 : 401 });
    const { id } = await context.params;
    const conversation = await prisma.aiTrainingConversation.findUnique({
      where: { id },
      select: {
        id: true,
        unit: true,
        runtimeVersion: true,
        title: true,
        createdByName: true,
        replyDueAt: true,
        replyStatus: true,
        replyVersion: true,
        createdAt: true,
        updatedAt: true,
        campaignCreative: {
          select: {
            id: true,
            label: true,
            validUntil: true,
            imageUrl: true,
            campaign: { select: { name: true } },
          },
        },
        campaign: {
          select: {
            id: true,
            name: true,
            status: true,
            objective: true,
            offerItems: {
              orderBy: { createdAt: "asc" },
              select: { procedureName: true, includedSessions: true },
            },
          },
        },
        conversationState: true,
        messages: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            role: true,
            content: true,
            originalContent: true,
            model: true,
            guardrailFlags: true,
            sdrAudit: true,
            editedByName: true,
            editedAt: true,
            createdAt: true,
          },
        },
      },
    });
    if (!conversation) return NextResponse.json({ error: "Chat não encontrado" }, { status: 404 });
    if (!canAccessAiTrainingUnit(user!, conversation.unit)) {
      return NextResponse.json({ error: "Sem acesso a esta unidade" }, { status: 403 });
    }
    const isDiagramV6 = conversation.runtimeVersion === AI_TRAINING_DIAGRAM_V6_RUNTIME;
    const imagePreviewUrl = isDiagramV6 && conversation.campaignCreative?.imageUrl
      ? await createPrivateBlobReadUrl(conversation.campaignCreative.imageUrl).catch(() => null)
      : null;
    return NextResponse.json({
      conversation: {
        ...conversation,
        campaignCreative: isDiagramV6 && conversation.campaignCreative
          ? { ...conversation.campaignCreative, imageUrl: undefined, imagePreviewUrl }
          : conversation.campaignCreative,
      },
    });
  } catch (error: unknown) {
    console.error("[GET /api/crm/ai-shadow/training/conversations/:id]", error);
    return NextResponse.json({ error: "Falha ao carregar chat interno", details: errorMessage(error) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = getUserFromHeaders(req);
    if (!canUseAiTraining(user)) {
      return NextResponse.json({ error: "Sem permissão para configurar a simulação" }, { status: user ? 403 : 401 });
    }
    const { id } = await context.params;
    const body = await req.json().catch(() => ({}));
    const campaignCreativeId = typeof body.campaignCreativeId === "string" && body.campaignCreativeId.trim()
      ? body.campaignCreativeId.trim().slice(0, 120)
      : null;
    const conversation = await prisma.aiTrainingConversation.findUnique({
      where: { id },
      select: { id: true, unit: true, runtimeVersion: true, replyStatus: true },
    });
    if (!conversation) return NextResponse.json({ error: "Chat não encontrado" }, { status: 404 });
    if (!canAccessAiTrainingUnit(user!, conversation.unit)) {
      return NextResponse.json({ error: "Sem acesso a esta unidade" }, { status: 403 });
    }
    if (conversation.runtimeVersion === AI_TRAINING_DIAGRAM_V6_RUNTIME) {
      return NextResponse.json({ error: "Inicie uma nova simulação V6 para trocar de campanha" }, { status: 409 });
    }
    if (["pending", "processing"].includes(conversation.replyStatus)) {
      return NextResponse.json({ error: "Aguarde a resposta atual antes de trocar o criativo" }, { status: 409 });
    }

    if (campaignCreativeId) {
      const creative = await prisma.aiTrainingCampaignCreative.findFirst({
        where: { id: campaignCreativeId, unit: conversation.unit, status: "approved" },
        select: { id: true, validUntil: true },
      });
      if (!creative) return NextResponse.json({ error: "Criativo aprovado não encontrado nesta unidade" }, { status: 404 });
      if (creative.validUntil && creative.validUntil.getTime() < Date.now()) {
        return NextResponse.json({ error: "Este criativo está com a oferta vencida" }, { status: 409 });
      }
    }

    const updated = await prisma.aiTrainingConversation.update({
      where: { id },
      data: { campaignCreativeId, conversationState: Prisma.DbNull },
      select: { id: true, campaignCreativeId: true },
    });
    return NextResponse.json({ conversation: updated });
  } catch (error: unknown) {
    console.error("[PATCH /api/crm/ai-shadow/training/conversations/:id]", error);
    return NextResponse.json({ error: "Falha ao configurar campanha", details: errorMessage(error) }, { status: 500 });
  }
}
