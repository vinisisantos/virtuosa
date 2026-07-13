import { normalizeCampaignText } from "@/lib/campaign-labels";

export const CAMPAIGN_ATTRIBUTIONS = [
  "automatic_meta",
  "automatic_utm",
  "manual",
  "historical_unverified",
] as const;

export type CampaignAttribution = (typeof CAMPAIGN_ATTRIBUTIONS)[number];

export type LeadAttributionCandidate = {
  source?: string | null;
  campaignAttribution?: string | null;
  campaignName?: string | null;
  campaignId?: string | null;
  fbclid?: string | null;
  utmCampaign?: string | null;
};

export function isMetaSource(source?: string | null) {
  const normalized = normalizeCampaignText(source);
  return normalized === "meta ads" || normalized === "facebook ad";
}

export function isMetaTrackingUrl(value?: string | null) {
  return /^https?:\/\//i.test(value || "");
}

export function isCampaignAttribution(value?: string | null): value is CampaignAttribution {
  return CAMPAIGN_ATTRIBUTIONS.includes(value as CampaignAttribution);
}

/**
 * Legacy rows did not record how a campaign was attributed. We only promote
 * them to automatic Meta when there is a durable tracking signal, never from
 * a free-text campaign name alone.
 */
export function resolveCampaignAttribution(client: LeadAttributionCandidate): CampaignAttribution | null {
  if (isCampaignAttribution(client.campaignAttribution)) return client.campaignAttribution;
  if (client.utmCampaign?.trim()) return "automatic_utm";
  if (isMetaSource(client.source) && (!!client.campaignId || isMetaTrackingUrl(client.fbclid))) {
    return "automatic_meta";
  }
  return client.campaignName?.trim() ? "historical_unverified" : null;
}

export function isConfirmedMetaLead(client: LeadAttributionCandidate) {
  return resolveCampaignAttribution(client) === "automatic_meta";
}

export function isMetaLeadCandidate(client: LeadAttributionCandidate) {
  return isMetaSource(client.source) || !!client.campaignName?.trim();
}

export function canonicalLeadSource(source?: string | null) {
  const normalized = normalizeCampaignText(source);
  if (normalized === "meta ads" || normalized === "facebook ad") return "meta_ads";
  if (normalized === "whatsapp") return "whatsapp";
  if (normalized === "instagram") return "instagram";
  if (normalized === "indicacao") return "indicacao";
  if (normalized === "google") return "google";
  if (normalized === "site") return "site";
  if (!normalized) return "desconhecido";
  return "outro";
}

export function originBucket(client: LeadAttributionCandidate) {
  const attribution = resolveCampaignAttribution(client);
  if (attribution === "automatic_meta") return "meta_ads";
  if (attribution === "manual" && isMetaSource(client.source)) return "atribuicao_manual";
  if (attribution === "historical_unverified" && isMetaSource(client.source)) return "meta_ads_pendente";
  return canonicalLeadSource(client.source);
}
