export const FACIAL_FILLER_CAMPAIGN_NAME = "Preenchimento Facial";
export const GLUTEOS_PERFEITOS_120ML_CAMPAIGN_NAME = "Glúteos Perfeitos 120ml";

type CampaignTrackRule = {
  campaignName: string;
  trackId: string;
  sourceMarkers: string[];
  units?: string[];
};

type CampaignAdIdRule = {
  adId: string;
  campaignName: string;
  unit: string;
};

type CampaignSourceUrlRule = {
  campaignName: string;
  sourceMarkers: string[];
  unit: string;
};

// A Meta pode reutilizar o mesmo sourceId em criativos diferentes. Quando o
// post/reel foi confirmado, o link do criativo é o sinal mais específico.
const CAMPAIGN_SOURCE_URL_RULES: CampaignSourceUrlRule[] = [
  {
    campaignName: GLUTEOS_PERFEITOS_120ML_CAMPAIGN_NAME,
    sourceMarkers: [
      "DcT5vGtAFVs",
      "DcT5t79AF2R",
      "6hDnjnq1V",
      "blVsIofjH",
      "1309185502272233",
    ],
    unit: "Osasco",
  },
  {
    campaignName: FACIAL_FILLER_CAMPAIGN_NAME,
    sourceMarkers: ["DcL-MELAE2a"],
    unit: "SBC",
  },
  {
    campaignName: "Barriga Trincada",
    sourceMarkers: ["Db313GhAjB3", "DcT5vIkgtgJ"],
    unit: "Osasco",
  },
];

const CAMPAIGN_AD_ID_RULES: CampaignAdIdRule[] = [
  { adId: "120249502709450006", campaignName: FACIAL_FILLER_CAMPAIGN_NAME, unit: "Osasco" },
  { adId: "120249502628370006", campaignName: "Glúteo Perfeito", unit: "Osasco" },
  { adId: "120249502294110006", campaignName: "Harmonização de Glúteos", unit: "Osasco" },
  { adId: "120249500621590006", campaignName: "Barriga Trincada", unit: "Osasco" },
  { adId: "120251954844540494", campaignName: "Glúteo Perfeito", unit: "Osasco" },
  { adId: "120249321672810006", campaignName: "Glúteo Perfeito", unit: "Osasco" },
  { adId: "120251954010740494", campaignName: "Harmonização de Glúteos", unit: "Osasco" },
  { adId: "120249321848920006", campaignName: "Harmonização de Glúteos", unit: "Osasco" },
  { adId: "120252124600900494", campaignName: "Glúteo Perfeito", unit: "Osasco" },
  { adId: "120249304650490006", campaignName: "Glúteo Perfeito", unit: "SBC" },
  { adId: "120247237450560077", campaignName: "Glúteo Perfeito", unit: "SBC" },
  { adId: "120247237187760077", campaignName: "Harmonização de Glúteos", unit: "SBC" },
  { adId: "120249007495800109", campaignName: "Glúteo Perfeito", unit: "SCS" },
  { adId: "120249310857190006", campaignName: "Glúteo Perfeito", unit: "SCS" },
  { adId: "120249007079190109", campaignName: "Harmonização de Glúteos", unit: "SCS" },
  { adId: "120249321328780006", campaignName: "Harmonização de Glúteos", unit: "SCS" },
];

export function campaignNameFromExactMetaAdId(
  adId?: string | null,
  unit?: string | null,
) {
  if (!adId) return null;
  const normalizedUnit = unit?.trim().toLowerCase();
  return CAMPAIGN_AD_ID_RULES.find((candidate) => (
    candidate.adId === adId
    && candidate.unit.toLowerCase() === normalizedUnit
  ))?.campaignName || null;
}

export function campaignNameFromExactMetaSourceUrl(
  sourceUrl?: string | null,
  unit?: string | null,
) {
  if (!sourceUrl) return null;
  const normalizedUnit = unit?.trim().toLowerCase();
  return CAMPAIGN_SOURCE_URL_RULES.find((candidate) => (
    candidate.unit.toLowerCase() === normalizedUnit
    && candidate.sourceMarkers.some((marker) => sourceUrl.includes(marker))
  ))?.campaignName || null;
}

const CAMPAIGN_TRACK_RULES: CampaignTrackRule[] = [
  {
    campaignName: FACIAL_FILLER_CAMPAIGN_NAME,
    trackId: "120246990006510077",
    sourceMarkers: ["DbEO4smg8Bp", "DbEOdFqgF2G", "4E0LPE5JJ", "5dCs9f9LA", "68zEwM4kV"],
  },
  {
    campaignName: "HyperSlim",
    trackId: "120242337801140077",
    sourceMarkers: ["120242338227290077", "DXpLxwogA7R", "5OaL7Tv9l", "4GYslkNl6", "98vPIWQMX", "e4bi9HWzB"],
  },
  {
    campaignName: "HyperSlim",
    trackId: "120243607265360109",
    sourceMarkers: ["120243607435250109", "DXpHKGRjI_-", "1X9rQj4VPh"],
  },
  {
    campaignName: FACIAL_FILLER_CAMPAIGN_NAME,
    trackId: "120249256172600006",
    sourceMarkers: [
      "120249256265090006",
      "71pMc2HoZ",
      "Dbe1fsbApkN",
      "Dbe11L0gXRu",
      "4DTajZ1Ll",
      "9qAoC3IQg",
      "78AmoAhaf",
    ],
    units: ["SBC"],
  },
  {
    campaignName: "Harmonização de Glúteos",
    trackId: "120247237187760077",
    sourceMarkers: ["DblYgJIA5ro"],
    units: ["SBC"],
  },
  {
    campaignName: "Glúteo Perfeito",
    trackId: "120249304650490006",
    sourceMarkers: ["Dbl2STtgqVZ"],
  },
  {
    campaignName: "Harmonização de Glúteos",
    trackId: "120249007079190109",
    sourceMarkers: ["DblZtcfM0sc", "9L1k1srhG", "4tjtZakIS"],
  },
  {
    campaignName: "Harmonização de Glúteos",
    trackId: "120251954010740494",
    sourceMarkers: ["DblXI_pAQgT"],
  },
];

export function campaignNameFromMetaSignals(
  trackId?: string | null,
  sourceUrl?: string | null,
  unit?: string | null,
) {
  const exactSourceCampaignName = campaignNameFromExactMetaSourceUrl(sourceUrl, unit);
  if (exactSourceCampaignName) return exactSourceCampaignName;
  if (!trackId) return null;
  const normalizedUnit = unit?.trim().toLowerCase();
  const exactAdCampaignName = campaignNameFromExactMetaAdId(trackId, unit);
  if (exactAdCampaignName) return exactAdCampaignName;
  if (!sourceUrl) return null;
  const rule = CAMPAIGN_TRACK_RULES.find((candidate) => (
    candidate.trackId === trackId
    && (!candidate.units || candidate.units.some((allowedUnit) => allowedUnit.toLowerCase() === normalizedUnit))
  ));
  return rule?.sourceMarkers.some((marker) => sourceUrl.includes(marker))
    ? rule.campaignName
    : null;
}

export function campaignNameFromMetaAdAndTrackSignals(
  adId?: string | null,
  trackId?: string | null,
  sourceUrl?: string | null,
  unit?: string | null,
) {
  return campaignNameFromMetaSignals(adId, sourceUrl, unit)
    || campaignNameFromMetaSignals(trackId, sourceUrl, unit);
}
