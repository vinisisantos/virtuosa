import { campaignNameFromExactMetaAdId } from "#lib/campaign-track-mapping";

export type MetaLeadCampaignRoute = {
  campaignName: string;
  messageCampaignName: string;
  eventTypeBase: string;
};

function eventTypeSlug(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

export function osascoMetaLeadCampaignFromAdId(
  adId?: string | null,
): MetaLeadCampaignRoute | null {
  const campaignName = campaignNameFromExactMetaAdId(adId, "Osasco");
  if (!campaignName) return null;

  return {
    campaignName,
    messageCampaignName: campaignName,
    eventTypeBase: `meta_lead_${eventTypeSlug(campaignName)}`,
  };
}
