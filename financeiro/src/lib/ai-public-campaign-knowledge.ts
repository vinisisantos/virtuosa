import { normalizeCampaignCreativeSnapshot } from "@/lib/ai-training-campaign-creatives";
import { resolveCampaignPrice } from "@/lib/ai-campaign-price-policy";
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
  campaignCreativeId?: string | null;
}) {
  const normalizedQuery = normalize(params.query);
  const campaignCreativeId = params.campaignCreativeId?.trim() || null;
  if (!normalizedQuery && !campaignCreativeId) return [];

  const creatives = await prisma.aiTrainingCampaignCreative.findMany({
    where: {
      ...(campaignCreativeId ? { id: campaignCreativeId } : {}),
      unit: params.unit,
      status: "approved",
      campaign: { is: { unit: params.unit } },
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
    take: campaignCreativeId ? 1 : 100,
  });

  const matchedCampaigns = new Set<string>();
  return creatives
    .map((creative) => {
      const snapshot = normalizeCampaignCreativeSnapshot(creative.approvedSnapshot);
      const score = campaignCreativeId ? 100 : containsPhrase(normalizedQuery, creative.campaign.name) ? 100 : 0;
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
    .map(({ creative, snapshot }) => {
      const price = resolveCampaignPrice({
        caption: creative.caption,
        imagePriceText: snapshot.priceText,
      });
      const commercialItems = snapshot.campaignItems.map((item) => ({
        name: item.commercialName,
        quantity: item.quantity,
        quantityText: item.quantityText,
      }));
      return {
        campaignName: creative.campaign.name,
        unit: params.unit,
        captionSeenByClient: creative.caption,
        procedures: commercialItems.length > 0
          ? commercialItems.map((item) => item.quantityText || item.name)
          : snapshot.procedures,
        commercialItems,
        knowledgeEntryIds: snapshot.campaignItems.flatMap((item) => item.cadernoEntryId ? [item.cadernoEntryId] : []),
        technicalItems: snapshot.campaignItems.flatMap((item) => item.technicalName
          ? [{ name: item.commercialName, technicalName: item.technicalName }]
          : []),
        offerSummary: snapshot.offerSummary,
        priceText: price.displayText,
        priceSource: price.source,
        priceSourceText: price.sourceText,
        paymentConditions: snapshot.paymentConditions,
        validity: creative.validUntil?.toISOString() || snapshot.validityText,
        advertisingClaims: snapshot.claims,
        restrictions: snapshot.restrictions,
        divergenceWarnings: snapshot.divergenceWarnings,
        usageRule: "Informe a oferta aprovada, mas trate alegações publicitárias somente como o texto visto no anúncio. Use o Caderno para explicar procedimentos e nunca prometa resultado, ausência de dor ou segurança individual.",
      };
    });
}
