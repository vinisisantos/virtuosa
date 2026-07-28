import { normalizeCampaignCreativeSnapshot } from "@/lib/ai-training-campaign-creatives";
import { prisma } from "@/lib/db";

const MAX_PUBLIC_CAMPAIGN_CONTEXTS = 2;

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function containsPhrase(query: string, phrase: string) {
  const normalizedPhrase = normalize(phrase);
  if (!normalizedPhrase) return false;
  if (` ${query} `.includes(` ${normalizedPhrase} `)) return true;

  const compactPhrase = normalizedPhrase.replace(/\s+/g, "");
  const compactQuery = query.replace(/\s+/g, "");
  return compactPhrase.length >= 6 && compactQuery.includes(compactPhrase);
}

export async function retrieveApprovedPublicCampaignContexts(params: {
  unit: string;
  query: string;
}) {
  const normalizedQuery = normalize(params.query);
  if (!normalizedQuery) return [];

  const creatives = await prisma.aiTrainingCampaignCreative.findMany({
    where: {
      unit: params.unit,
      status: "approved",
      OR: [{ validUntil: null }, { validUntil: { gte: new Date() } }],
    },
    select: {
      caption: true,
      validUntil: true,
      approvedSnapshot: true,
      approvedAt: true,
      campaign: { select: { name: true } },
    },
    orderBy: { approvedAt: "desc" },
    take: 100,
  });

  const matchedCampaigns = new Set<string>();
  return creatives
    .map((creative) => {
      const snapshot = normalizeCampaignCreativeSnapshot(creative.approvedSnapshot);
      const score = containsPhrase(normalizedQuery, creative.campaign.name) ? 100 : 0;
      return { creative, snapshot, score };
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score)
    .filter((item) => {
      const key = normalize(item.creative.campaign.name);
      if (matchedCampaigns.has(key)) return false;
      matchedCampaigns.add(key);
      return true;
    })
    .slice(0, MAX_PUBLIC_CAMPAIGN_CONTEXTS)
    .map(({ creative, snapshot }) => ({
      campaignName: creative.campaign.name,
      captionSeenByClient: creative.caption,
      procedures: snapshot.procedures,
      offerSummary: snapshot.offerSummary,
      priceText: snapshot.priceText,
      paymentConditions: snapshot.paymentConditions,
      validity: creative.validUntil?.toISOString() || snapshot.validityText,
      advertisingClaims: snapshot.claims,
      restrictions: snapshot.restrictions,
      divergenceWarnings: snapshot.divergenceWarnings,
      usageRule: "Informe a oferta aprovada, mas trate alegações publicitárias somente como o texto visto no anúncio. Use o Caderno para explicar procedimentos e nunca prometa resultado, ausência de dor ou segurança individual.",
    }));
}
