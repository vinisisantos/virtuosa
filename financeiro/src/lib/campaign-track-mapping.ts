export const FACIAL_FILLER_CAMPAIGN_NAME = "Preenchimento Facial";

const FACIAL_FILLER_META_TRACK_ID = "120246990006510077";
const FACIAL_FILLER_SOURCE_MARKERS = [
  "DbEO4smg8Bp",
  "DbEOdFqgF2G",
  "4E0LPE5JJ",
  "5dCs9f9LA",
  "68zEwM4kV",
];

export function campaignNameFromMetaSignals(
  trackId?: string | null,
  sourceUrl?: string | null,
) {
  if (trackId !== FACIAL_FILLER_META_TRACK_ID || !sourceUrl) return null;
  return FACIAL_FILLER_SOURCE_MARKERS.some((marker) => sourceUrl.includes(marker))
    ? FACIAL_FILLER_CAMPAIGN_NAME
    : null;
}
