import { NextRequest, NextResponse } from "next/server";
import { getUserFromHeaders } from "@/lib/auth";
import {
  campaignCreativeHasOpenEndedValidity,
  campaignCreativeRequiresValidity,
  normalizeCampaignCreativeSnapshot,
} from "@/lib/ai-training-campaign-creatives";
import { canAccessAiTrainingUnit, canUseAiTraining, visibleAiTrainingUnits } from "@/lib/ai-training";
import { prisma } from "@/lib/db";
import { createPrivateBlobReadUrl } from "@/lib/whatsapp/media-storage";

function cleanText(value: unknown, max: number) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function parseDate(value: unknown) {
  if (typeof value !== "string" || !value) return null;
  const date = new Date(`${value.slice(0, 10)}T23:59:59.999-03:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : undefined;
}

async function withPreviewUrl<T extends { imageUrl: string | null }>(creative: T) {
  return {
    ...creative,
    imagePreviewUrl: creative.imageUrl ? await createPrivateBlobReadUrl(creative.imageUrl).catch(() => null) : null,
  };
}

export async function GET(req: NextRequest) {
  try {
    const user = getUserFromHeaders(req);
    if (!canUseAiTraining(user)) {
      return NextResponse.json({ error: "Sem permissão para usar o treinamento da IA" }, { status: user ? 403 : 401 });
    }

    const { searchParams } = new URL(req.url);
    const requestedUnit = cleanText(searchParams.get("unit"), 80);
    const view = searchParams.get("view") || "manager";
    const allowedUnits = visibleAiTrainingUnits(user!);
    if (requestedUnit && !canAccessAiTrainingUnit(user!, requestedUnit)) {
      return NextResponse.json({ error: "Sem acesso a esta unidade" }, { status: 403 });
    }
    const units = requestedUnit ? [requestedUnit] : allowedUnits;

    const creativeWhere = {
      unit: { in: units },
      ...(view === "options" ? { status: "approved" } : { status: { not: "archived" } }),
    };
    const [campaigns, rawCreatives] = await Promise.all([
      view === "options" ? Promise.resolve([]) : prisma.campaign.findMany({
        where: { unit: { in: units } },
        orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
        select: {
          id: true,
          name: true,
          unit: true,
          status: true,
          objective: true,
          startDate: true,
          endDate: true,
          offerItems: {
            orderBy: { createdAt: "asc" },
            select: { procedureName: true, includedSessions: true },
          },
        },
      }),
      prisma.aiTrainingCampaignCreative.findMany({
        where: creativeWhere,
        orderBy: { updatedAt: "desc" },
        take: view === "options" ? 100 : 200,
        select: {
          id: true,
          campaignId: true,
          unit: true,
          label: true,
          caption: true,
          externalAdId: true,
          externalCreativeId: true,
          imageUrl: true,
          imageFileName: true,
          imageMimeType: true,
          imageSizeBytes: true,
          validUntil: true,
          status: true,
          extractedData: true,
          approvedSnapshot: true,
          analysisModel: true,
          analysisError: true,
          analyzedAt: true,
          createdByName: true,
          approvedByName: true,
          approvedAt: true,
          createdAt: true,
          updatedAt: true,
          campaign: {
            select: {
              name: true,
              objective: true,
              status: true,
              offerItems: { select: { procedureName: true, includedSessions: true } },
            },
          },
        },
      }),
    ]);
    const creatives = await Promise.all(rawCreatives.map(withPreviewUrl));

    return NextResponse.json({ campaigns, creatives, allowedUnits, isAdmin: user!.isAdmin });
  } catch (error: unknown) {
    console.error("[GET /api/crm/ai-shadow/training/campaign-creatives]", error);
    return NextResponse.json({ error: "Falha ao carregar criativos", details: errorMessage(error) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = getUserFromHeaders(req);
    if (!canUseAiTraining(user)) {
      return NextResponse.json({ error: "Sem permissão para cadastrar criativos" }, { status: user ? 403 : 401 });
    }
    const body = await req.json().catch(() => ({}));
    const campaignId = cleanText(body.campaignId, 120);
    const label = cleanText(body.label, 160);
    if (!campaignId || !label) {
      return NextResponse.json({ error: "Campanha e nome do criativo são obrigatórios" }, { status: 400 });
    }

    const campaign = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { id: true, unit: true } });
    if (!campaign) return NextResponse.json({ error: "Campanha não encontrada" }, { status: 404 });
    if (!canAccessAiTrainingUnit(user!, campaign.unit)) {
      return NextResponse.json({ error: "Sem acesso à unidade desta campanha" }, { status: 403 });
    }

    const creative = await prisma.aiTrainingCampaignCreative.create({
      data: {
        campaignId: campaign.id,
        unit: campaign.unit,
        label,
        caption: cleanText(body.caption, 6000) || null,
        externalAdId: cleanText(body.externalAdId, 200) || null,
        externalCreativeId: cleanText(body.externalCreativeId, 200) || null,
        validUntil: parseDate(body.validUntil),
        createdById: user!.userId,
        createdByName: user!.name || user!.email,
      },
    });
    return NextResponse.json({ creative }, { status: 201 });
  } catch (error: unknown) {
    console.error("[POST /api/crm/ai-shadow/training/campaign-creatives]", error);
    return NextResponse.json({ error: "Falha ao criar criativo", details: errorMessage(error) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = getUserFromHeaders(req);
    if (!canUseAiTraining(user)) {
      return NextResponse.json({ error: "Sem permissão para revisar criativos" }, { status: user ? 403 : 401 });
    }
    const body = await req.json().catch(() => ({}));
    const id = cleanText(body.id, 120);
    const action = cleanText(body.action, 40);
    if (!id || !action) return NextResponse.json({ error: "Criativo e ação são obrigatórios" }, { status: 400 });

    const creative = await prisma.aiTrainingCampaignCreative.findUnique({
      where: { id },
      select: {
        id: true,
        unit: true,
        status: true,
        imageUrl: true,
        caption: true,
        extractedData: true,
      },
    });
    if (!creative) return NextResponse.json({ error: "Criativo não encontrado" }, { status: 404 });
    if (!canAccessAiTrainingUnit(user!, creative.unit)) {
      return NextResponse.json({ error: "Sem acesso a esta unidade" }, { status: 403 });
    }

    if (["approve", "reject", "archive"].includes(action) && !user!.isAdmin) {
      return NextResponse.json({ error: "Somente administradores podem concluir a revisão" }, { status: 403 });
    }

    if (action === "approve") {
      if (!creative.imageUrl || !creative.extractedData) {
        return NextResponse.json({ error: "Analise a imagem antes de aprovar" }, { status: 409 });
      }
      const snapshot = normalizeCampaignCreativeSnapshot(body.snapshot || creative.extractedData);
      const caption = cleanText(body.caption, 6000) || creative.caption;
      const validUntil = parseDate(body.validUntil);
      if (campaignCreativeRequiresValidity(snapshot, caption)
        && !validUntil
        && !campaignCreativeHasOpenEndedValidity(snapshot)) {
        return NextResponse.json({
          error: "Informe a data de validade ou registre no texto que a condição está vigente sem prazo definido",
        }, { status: 400 });
      }
      const updated = await prisma.aiTrainingCampaignCreative.update({
        where: { id },
        data: {
          label: cleanText(body.label, 160) || undefined,
          caption: caption || null,
          validUntil,
          approvedSnapshot: snapshot,
          status: "approved",
          approvedById: user!.userId,
          approvedByName: user!.name || user!.email,
          approvedAt: new Date(),
          analysisError: null,
        },
      });
      return NextResponse.json({ creative: updated });
    }

    if (action === "reject") {
      const updated = await prisma.aiTrainingCampaignCreative.update({
        where: { id },
        data: {
          status: "rejected",
          approvedSnapshot: undefined,
          approvedById: user!.userId,
          approvedByName: user!.name || user!.email,
          approvedAt: new Date(),
          analysisError: cleanText(body.reason, 1000) || "Reprovado na revisão humana",
        },
      });
      return NextResponse.json({ creative: updated });
    }

    if (action === "archive") {
      await prisma.aiTrainingCampaignCreative.update({ where: { id }, data: { status: "archived" } });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Ação inválida" }, { status: 400 });
  } catch (error: unknown) {
    console.error("[PATCH /api/crm/ai-shadow/training/campaign-creatives]", error);
    return NextResponse.json({ error: "Falha ao revisar criativo", details: errorMessage(error) }, { status: 500 });
  }
}
