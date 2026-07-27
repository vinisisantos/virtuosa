import { NextRequest, NextResponse } from "next/server";
import { getUserFromHeaders } from "@/lib/auth";
import {
  AI_TRAINING_CREATIVE_CONTENT_TYPES,
  AI_TRAINING_CREATIVE_MAX_FILE_BYTES,
  analyzeAiTrainingCampaignCreative,
} from "@/lib/ai-training-campaign-creatives";
import { canAccessAiTrainingUnit, canUseAiTraining } from "@/lib/ai-training";
import { prisma } from "@/lib/db";
import { privateBlobPathname } from "@/lib/whatsapp/media-storage";

export const maxDuration = 60;

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    const user = getUserFromHeaders(req);
    if (!canUseAiTraining(user)) {
      return NextResponse.json({ error: "Sem permissão para analisar criativos" }, { status: user ? 403 : 401 });
    }
    const body = await req.json().catch(() => ({}));
    const creative = await prisma.aiTrainingCampaignCreative.findUnique({
      where: { id },
      select: {
        id: true,
        unit: true,
        label: true,
        caption: true,
        status: true,
        campaign: {
          select: {
            name: true,
            unit: true,
            objective: true,
            notes: true,
            offerItems: { select: { procedureName: true, includedSessions: true } },
          },
        },
      },
    });
    if (!creative) return NextResponse.json({ error: "Criativo não encontrado" }, { status: 404 });
    if (!canAccessAiTrainingUnit(user!, creative.unit)) {
      return NextResponse.json({ error: "Sem acesso a esta unidade" }, { status: 403 });
    }

    const imageUrl = text(body.imageUrl, 3000);
    const imageFileName = text(body.imageFileName, 300);
    const imageMimeType = text(body.imageMimeType, 120).toLowerCase();
    const imageSizeBytes = Number(body.imageSizeBytes);
    const pathname = privateBlobPathname(imageUrl);
    if (!pathname?.startsWith(`ai-training/campaign-creatives/${creative.id}/`)) {
      return NextResponse.json({ error: "Arquivo privado inválido para este criativo" }, { status: 400 });
    }
    if (!AI_TRAINING_CREATIVE_CONTENT_TYPES.includes(imageMimeType)) {
      return NextResponse.json({ error: "Use uma imagem PNG, JPEG ou WEBP" }, { status: 400 });
    }
    if (!Number.isInteger(imageSizeBytes) || imageSizeBytes <= 0 || imageSizeBytes > AI_TRAINING_CREATIVE_MAX_FILE_BYTES) {
      return NextResponse.json({ error: "A imagem deve ter no máximo 10 MB" }, { status: 400 });
    }

    const claimed = await prisma.aiTrainingCampaignCreative.updateMany({
      where: { id: creative.id, status: { notIn: ["analyzing", "approved", "archived"] } },
      data: {
        status: "analyzing",
        imageUrl,
        imageFileName: imageFileName || null,
        imageMimeType,
        imageSizeBytes,
        analysisError: null,
      },
    });
    if (claimed.count === 0) {
      return NextResponse.json({ error: "Este criativo já está sendo analisado ou concluído" }, { status: 409 });
    }

    try {
      const analysis = await analyzeAiTrainingCampaignCreative({
        imageUrl,
        campaign: creative.campaign,
        label: creative.label,
        caption: creative.caption,
      });
      const updated = await prisma.aiTrainingCampaignCreative.update({
        where: { id: creative.id },
        data: {
          status: "pending_review",
          extractedData: analysis.snapshot,
          analysisModel: analysis.model,
          analysisPromptVersion: analysis.promptVersion,
          analyzedAt: new Date(),
          analysisError: null,
        },
      });
      return NextResponse.json({ creative: updated, analysis });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Falha desconhecida na análise";
      await prisma.aiTrainingCampaignCreative.update({
        where: { id: creative.id },
        data: { status: "analysis_failed", analysisError: message.slice(0, 1500) },
      });
      throw error;
    }
  } catch (error: unknown) {
    console.error("[POST training campaign creative analyze]", error);
    return NextResponse.json({
      error: "Não foi possível analisar o criativo",
      details: error instanceof Error ? error.message : undefined,
    }, { status: 500 });
  }
}
