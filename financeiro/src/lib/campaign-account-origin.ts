export type CampaignAccountOrigin = "secondary";

const SHARED_SECONDARY_META_TRACK_IDS = [
  "120247237187760077",
  "120249007079190109",
  "120249304650490006",
  "120251954010740494",
];

const DEFAULT_SECONDARY_META_TRACK_IDS_BY_UNIT: Record<string, string[]> = {
  Osasco: ["120248887107550006", ...SHARED_SECONDARY_META_TRACK_IDS],
  SBC: ["120249051596890006", "120249256172600006", ...SHARED_SECONDARY_META_TRACK_IDS],
  SCS: ["120249051596890006", ...SHARED_SECONDARY_META_TRACK_IDS],
};
const DEFAULT_OSASCO_BARRIGA_TRACK_IDS = ["120248887107550006"];
export const SECONDARY_META_CAMPAIGN_NAME = "Barriga Trincada";

const configuredSecondaryMetaTrackIds = new Set(
  (process.env.META_SECONDARY_TRACK_IDS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
);
const secondaryMetaTrackIdsByUnit = new Map(
  Object.entries(DEFAULT_SECONDARY_META_TRACK_IDS_BY_UNIT).map(([unit, trackIds]) => [
    unit.toLowerCase(),
    new Set(trackIds),
  ]),
);
const defaultSecondaryMetaTrackIds = new Set(
  Object.values(DEFAULT_SECONDARY_META_TRACK_IDS_BY_UNIT).flat(),
);
const osascoBarrigaTrackIds = new Set(
  (process.env.META_OSASCO_BARRIGA_TRACK_IDS || DEFAULT_OSASCO_BARRIGA_TRACK_IDS.join(","))
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
);

export function campaignAccountOriginFromTrackId(
  trackId?: string | null,
  unit?: string | null,
): CampaignAccountOrigin | null {
  if (!trackId) return null;
  if (configuredSecondaryMetaTrackIds.has(trackId)) return "secondary";

  const normalizedUnit = unit?.trim().toLowerCase();
  const isSecondary = normalizedUnit
    ? secondaryMetaTrackIdsByUnit.get(normalizedUnit)?.has(trackId)
    : defaultSecondaryMetaTrackIds.has(trackId);

  return isSecondary ? "secondary" : null;
}

export function campaignNameFromAccountTrackId(trackId?: string | null) {
  return trackId && osascoBarrigaTrackIds.has(trackId)
    ? SECONDARY_META_CAMPAIGN_NAME
    : null;
}
