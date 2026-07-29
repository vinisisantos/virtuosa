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

const SUBJECT_TOKEN_STOP_WORDS = new Set([
  "campanha",
  "projeto",
  "protocolo",
  "tratamento",
  "facial",
  "corporal",
]);

function containsSubjectReference(query: string, subject: string) {
  if (containsPhrase(query, subject)) return true;
  const queryTokens = new Set(query.split(" ").filter(Boolean));
  return normalize(subject)
    .split(" ")
    .some((token) => token.length >= 5 && !SUBJECT_TOKEN_STOP_WORDS.has(token) && queryTokens.has(token));
}

export async function retrieveApprovedPublicCampaignContexts(params: {
  unit: string;
  query: string;
  campaignCreativeId?: string | null;
  continuationCampaignName?: string | null;
}) {
  const normalizedQuery = normalize(params.query);
  const campaignCreativeId = params.campaignCreativeId?.trim() || null;
  const continuationCampaignName = normalize(params.continuationCampaignName || "");
  if (!normalizedQuery && !campaignCreativeId) return [];

  const creatives = await prisma.aiTrainingCampaignCreative.findMany({
    where: {
      unit: params.unit,
      status: "approved",
      campaign: { is: { unit: params.unit } },
      OR: [{ validUntil: null }, { validUntil: { gte: new Date() } }],
    },
    select: {
      id: true,
      caption: true,
      validUntil: true,
      approvedSnapshot: true,
      approvedAt: true,
      campaign: { select: { name: true } },
    },
    orderBy: { approvedAt: "desc" },
    take: 100,
  });

  const candidates = creatives.map((creative) => {
    const snapshot = normalizeCampaignCreativeSnapshot(creative.approvedSnapshot);
    const normalizedCampaignName = normalize(creative.campaign.name);
    const explicit = [
      creative.campaign.name,
      ...snapshot.campaignItems.map((item) => item.commercialName),
      ...snapshot.procedures,
    ].some((subject) => containsSubjectReference(normalizedQuery, subject));
    const continuation = !!continuationCampaignName && normalizedCampaignName === continuationCampaignName;
    const linked = creative.id === campaignCreativeId;
    return {
      creative,
      snapshot,
      source: explicit ? "current_message" : continuation ? "conversation" : "link_origin",
      score: explicit ? 300 : continuation ? 200 : linked ? 100 : 0,
    };
  });
  const explicitCandidates = candidates.filter((item) => item.score === 300);
  const comparisonRequested = /\b(?:compar|os\s+dois|ambos)\b/i.test(params.query);
  const relevantCandidates = explicitCandidates.length > 0
    ? explicitCandidates
    : candidates.filter((item) => item.score >= (comparisonRequested ? 100 : 200)).length > 0
      ? candidates.filter((item) => item.score >= (comparisonRequested ? 100 : 200))
      : candidates.filter((item) => item.score === 100);

  const matchedCampaigns = new Set<string>();
  return relevantCandidates
    .sort((left, right) => right.score - left.score)
    .filter((item) => {
      const key = normalize(item.creative.campaign.name);
      if (matchedCampaigns.has(key)) return false;
      matchedCampaigns.add(key);
      return true;
    })
    .slice(0, MAX_PUBLIC_CAMPAIGN_CONTEXTS)
    .map(({ creative, snapshot, source }) => {
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
        contextSource: source,
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
