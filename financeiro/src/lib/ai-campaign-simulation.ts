import { randomInt } from "node:crypto";
import { prisma } from "@/lib/db";

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
