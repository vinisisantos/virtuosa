export type CampaignAccountOrigin = "secondary";

const DEFAULT_SECONDARY_META_TRACK_IDS = ["120248887107550006"];

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
