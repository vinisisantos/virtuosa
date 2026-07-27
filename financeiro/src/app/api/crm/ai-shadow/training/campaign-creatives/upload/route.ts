import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextRequest, NextResponse } from "next/server";
import { getUserFromHeaders } from "@/lib/auth";
import {
  AI_TRAINING_CREATIVE_CONTENT_TYPES,
  AI_TRAINING_CREATIVE_MAX_FILE_BYTES,
} from "@/lib/ai-training-campaign-creatives";
import { canAccessAiTrainingUnit, canUseAiTraining } from "@/lib/ai-training";
import { prisma } from "@/lib/db";

function clientCreativeId(value: string | null) {
  try {
    const parsed = JSON.parse(value || "{}");
    return typeof parsed.creativeId === "string" ? parsed.creativeId : "";
  } catch {
    return "";
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = getUserFromHeaders(req);
    if (!canUseAiTraining(user)) {
      return NextResponse.json({ error: "Sem permissão para enviar criativos" }, { status: user ? 403 : 401 });
    }
    const body = await req.json() as HandleUploadBody;
    const response = await handleUpload({
      request: req,
      body,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const creativeId = clientCreativeId(clientPayload);
        if (!creativeId) throw new Error("Criativo não informado para o upload");
        const creative = await prisma.aiTrainingCampaignCreative.findUnique({
          where: { id: creativeId },
          select: { id: true, unit: true, status: true },
        });
        if (!creative || !canAccessAiTrainingUnit(user!, creative.unit)) {
          throw new Error("Criativo não encontrado ou sem permissão");
        }
        if (creative.status === "approved" || creative.status === "archived") {
          throw new Error("Este criativo não aceita um novo arquivo");
        }
        const expectedPrefix = `ai-training/campaign-creatives/${creative.id}/`;
        if (!pathname.startsWith(expectedPrefix) || pathname.includes("..")) {
          throw new Error("Destino de upload inválido");
        }
        return {
          allowedContentTypes: AI_TRAINING_CREATIVE_CONTENT_TYPES,
          maximumSizeInBytes: AI_TRAINING_CREATIVE_MAX_FILE_BYTES,
          addRandomSuffix: true,
          allowOverwrite: false,
          cacheControlMaxAge: 60,
          validUntil: Date.now() + 15 * 60 * 1000,
        };
      },
    });
    return NextResponse.json(response);
  } catch (error: unknown) {
    console.error("[POST training campaign creative upload]", error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Não foi possível autorizar o upload",
    }, { status: 400 });
  }
}
