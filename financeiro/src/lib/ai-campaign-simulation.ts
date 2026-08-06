import { randomInt } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { AiTrainingDiagramV6Campaign } from "@/lib/ai-training-diagram-v6";

function campaignNameKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const publicCampaignSelection = {
  id: true,
  label: true,
  campaign: { select: { name: true } },
} as const;

function diagramV6CampaignSelection() {
  return {
    id: true,
    name: true,
    unit: true,
    status: true,
    objective: true,
    offerItems: {
      orderBy: { createdAt: "asc" as const },
      select: { procedureName: true, includedSessions: true },
    },
    trainingCreatives: {
      where: {
        status: "approved",
        OR: [{ validUntil: null }, { validUntil: { gte: new Date() } }],
      },
      orderBy: [{ approvedAt: "desc" as const }, { updatedAt: "desc" as const }],
      take: 1,
      select: {
        id: true,
        approvedSnapshot: true,
      },
    },
  } satisfies Prisma.CampaignSelect;
}

function approvedPriceText(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const priceText = (value as Record<string, unknown>).priceText;
  return typeof priceText === "string" && priceText.trim() ? priceText.trim().slice(0, 160) : null;
}

function diagramV6Campaign(campaign: {
  id: string;
  name: string;
  unit: string;
  status: string;
  objective: string | null;
  offerItems: Array<{ procedureName: string; includedSessions: number }>;
  trainingCreatives: Array<{ id: string; approvedSnapshot: unknown }>;
}): AiTrainingDiagramV6Campaign {
  const creative = campaign.trainingCreatives[0] || null;
  return {
    id: campaign.id,
    name: campaign.name,
    unit: campaign.unit,
    status: campaign.status,
    objective: campaign.objective,
    offerItems: campaign.offerItems,
    creativeId: creative?.id || null,
    approvedPriceText: approvedPriceText(creative?.approvedSnapshot),
  };
}

export async function listDistinctApprovedCampaignCreatives(unit: string) {
  const approvedCreatives = await prisma.aiTrainingCampaignCreative.findMany({
    where: {
      unit,
      status: "approved",
      campaign: { is: { unit } },
      OR: [{ validUntil: null }, { validUntil: { gte: new Date() } }],
    },
    orderBy: [{ approvedAt: "desc" }, { updatedAt: "desc" }],
    take: 100,
    select: publicCampaignSelection,
  });

  const selectedCampaignNames = new Set<string>();
  return approvedCreatives.filter((creative) => {
    const key = campaignNameKey(creative.campaign.name);
    if (!key || selectedCampaignNames.has(key)) return false;
    selectedCampaignNames.add(key);
    return true;
  });
}

export async function selectRandomApprovedCampaignCreative(unit: string) {
  const campaignChoices = await listDistinctApprovedCampaignCreatives(unit);
  return campaignChoices.length > 0
    ? campaignChoices[randomInt(campaignChoices.length)]
    : null;
}

export async function findApprovedCampaignCreative(unit: string, creativeId?: string | null) {
  if (!creativeId) return null;
  return prisma.aiTrainingCampaignCreative.findFirst({
    where: {
      id: creativeId,
      unit,
      status: "approved",
      campaign: { is: { unit } },
      OR: [{ validUntil: null }, { validUntil: { gte: new Date() } }],
    },
    select: publicCampaignSelection,
  });
}

export async function listAiTrainingDiagramV6Campaigns(unit: string) {
  const campaigns = await prisma.campaign.findMany({
    where: { unit },
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
    take: 200,
    select: diagramV6CampaignSelection(),
  });
  return campaigns.map(diagramV6Campaign);
}

export async function findAiTrainingDiagramV6Campaign(unit: string, campaignId: string) {
  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, unit },
    select: diagramV6CampaignSelection(),
  });
  return campaign ? diagramV6Campaign(campaign) : null;
}

export async function selectRandomAiTrainingDiagramV6Campaign(unit: string) {
  const activeCampaigns = (await listAiTrainingDiagramV6Campaigns(unit))
    .filter((campaign) => campaign.status === "ativa");
  return activeCampaigns.length > 0
    ? activeCampaigns[randomInt(activeCampaigns.length)]
    : null;
}
