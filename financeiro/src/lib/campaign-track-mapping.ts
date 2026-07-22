export const FACIAL_FILLER_CAMPAIGN_NAME = "Preenchimento Facial";

const CAMPAIGN_NAME_BY_META_TRACK_ID = new Map<string, string>([
  // Sinal CTWA confirmado em diferentes variações do anúncio de SBC.
  ["120246990006510077", FACIAL_FILLER_CAMPAIGN_NAME],
]);

export function campaignNameFromMetaTrackId(trackId?: string | null) {
  return trackId ? CAMPAIGN_NAME_BY_META_TRACK_ID.get(trackId) || null : null;
}
