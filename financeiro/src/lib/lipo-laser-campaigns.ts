import { normalizeCampaignText } from "./campaign-labels.ts";

export const LIPO_LASER_CAMPAIGN_NAME = "LIPO LASER";
export const LIPO_LASER_2_CAMPAIGN_NAME = "LIPO LASER 2";
export const LIPO_LASER_AD_ID = "120250557434650006";
export const LIPO_LASER_2_AD_ID = "120250557635720006";

function isLipoLaserUnit(unit?: string | null) {
  return unit?.trim().toLowerCase() === "sbc";
}

export function isLipoLaserCampaignName(name?: string | null) {
  return ["lipo laser", "lipo laser 2"].includes(normalizeCampaignText(name));
}

export function lipoLaserCampaignFromAdId(adId?: string | null, unit?: string | null) {
  if (!isLipoLaserUnit(unit)) return null;
  if (adId === LIPO_LASER_AD_ID) return LIPO_LASER_CAMPAIGN_NAME;
  if (adId === LIPO_LASER_2_AD_ID) return LIPO_LASER_2_CAMPAIGN_NAME;
  return null;
}

export function lipoLaserCampaignFromPrefilledMessage(message?: string | null, unit?: string | null) {
  if (!isLipoLaserUnit(unit)) return null;
  const normalized = normalizeCampaignText(message);
  const opening = "^(?:(?:ola|oi) )?(?:eu )?vim ";
  const continuation = "(?= (?:posso|gostaria|quero|tenho)|$)";
  if (new RegExp(`${opening}pela emagreca 2 ?kg${continuation}`).test(normalized)) {
    return LIPO_LASER_CAMPAIGN_NAME;
  }
  if (new RegExp(`${opening}pelas 5 sessoes de lipo laser${continuation}`).test(normalized)) {
    return LIPO_LASER_2_CAMPAIGN_NAME;
  }
  return null;
}

export function lipoLaserCampaignFromOfferSignal(signal?: string | null, unit?: string | null) {
  if (!isLipoLaserUnit(unit) || !/\blipo laser\b/.test(normalizeCampaignText(signal))) return null;
  const raw = signal || "";
  const standardOffer = /(?<![\d.,])699(?:[,.]00)?(?!\d|[.,]\d)/.test(raw);
  const packageOffer = /(?<![\d.,])2[.\s]?999(?:[,.]00)?(?!\d|[.,]\d)/.test(raw);
  if (standardOffer === packageOffer) return null;
  return packageOffer ? LIPO_LASER_2_CAMPAIGN_NAME : LIPO_LASER_CAMPAIGN_NAME;
}
