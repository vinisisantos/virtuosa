export const FACIAL_FILLER_CAMPAIGN_NAME = "Preenchimento Facial";

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

const CAMPAIGN_AD_ID_RULES: CampaignAdIdRule[] = [
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
  if (!trackId) return null;
  const normalizedUnit = unit?.trim().toLowerCase();
  const exactAdRule = CAMPAIGN_AD_ID_RULES.find((candidate) => (
    candidate.adId === trackId
    && candidate.unit.toLowerCase() === normalizedUnit
  ));
  if (exactAdRule) return exactAdRule.campaignName;
  if (!sourceUrl) return null;
  const rule = CAMPAIGN_TRACK_RULES.find((candidate) => (
    candidate.trackId === trackId
    && (!candidate.units || candidate.units.some((allowedUnit) => allowedUnit.toLowerCase() === normalizedUnit))
  ));
  return rule?.sourceMarkers.some((marker) => sourceUrl.includes(marker))
    ? rule.campaignName
    : null;
}
