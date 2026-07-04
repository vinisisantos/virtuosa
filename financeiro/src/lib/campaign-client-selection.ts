import { isGenericCampaignName } from "@/lib/campaign-labels";

export type CampaignClientCandidate = {
  campaignName?: string | null;
  campaignId?: string | null;
  fbclid?: string | null;
  source?: string | null;
  updatedAt?: Date | string | null;
};

export function campaignUrlFromClient(client?: CampaignClientCandidate | null) {
  const url = client?.fbclid || "";
  return /^https?:\/\//i.test(url) ? url : null;
}

function campaignClientScore(client: CampaignClientCandidate) {
  const hasCampaign = !!client.campaignName;
  const hasUrl = !!campaignUrlFromClient(client);
  const hasTrackId = !!client.campaignId;
  const hasAdEvidence = hasUrl || hasTrackId || client.source === "facebook_ad";
  const isGeneric = isGenericCampaignName(client.campaignName);

  return [
    hasCampaign ? 1 : 0,
    hasCampaign && !isGeneric ? 1 : 0,
    hasUrl ? 1 : 0,
    hasTrackId ? 1 : 0,
    hasAdEvidence ? 1 : 0,
  ];
}

function compareScore(a: number[], b: number[]) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] || 0) - (b[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function updatedAtMs(client: CampaignClientCandidate) {
  if (!client.updatedAt) return 0;
  const time = new Date(client.updatedAt).getTime();
  return Number.isFinite(time) ? time : 0;
}

export function compareCampaignClients(a: CampaignClientCandidate, b: CampaignClientCandidate) {
  const scoreDiff = compareScore(campaignClientScore(a), campaignClientScore(b));
  if (scoreDiff !== 0) return scoreDiff;
  return updatedAtMs(a) - updatedAtMs(b);
}

export function pickBestCampaignClient<T extends CampaignClientCandidate>(candidates: T[]) {
  return candidates.reduce<T | null>((best, candidate) => {
    if (!best) return candidate;
    return compareCampaignClients(candidate, best) > 0 ? candidate : best;
  }, null);
}
