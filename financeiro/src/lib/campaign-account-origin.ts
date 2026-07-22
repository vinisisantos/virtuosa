export type CampaignAccountOrigin = "secondary";

const DEFAULT_SECONDARY_META_TRACK_IDS = ["120248887107550006"];
export const SECONDARY_META_CAMPAIGN_NAME = "Barriga Trincada";

const secondaryMetaTrackIds = new Set(
  (process.env.META_SECONDARY_TRACK_IDS || DEFAULT_SECONDARY_META_TRACK_IDS.join(","))
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
);

export function campaignAccountOriginFromTrackId(
  trackId?: string | null,
): CampaignAccountOrigin | null {
  return trackId && secondaryMetaTrackIds.has(trackId) ? "secondary" : null;
}

export function campaignNameFromAccountTrackId(trackId?: string | null) {
  return campaignAccountOriginFromTrackId(trackId) === "secondary"
    ? SECONDARY_META_CAMPAIGN_NAME
    : null;
}
