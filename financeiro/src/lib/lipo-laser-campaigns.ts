import { normalizeCampaignText } from "./campaign-labels.ts";

export const LIPO_LASER_CAMPAIGN_NAME = "LIPO LASER";
export const LIPO_LASER_2_CAMPAIGN_NAME = "LIPO LASER 2";
export const LIPO_LASER_AD_ID = "120250557434650006";
export const LIPO_LASER_2_AD_ID = "120250557635720006";
export const OSASCO_LIPO_LASER_AD_ID = "120253281469150494";

function isLipoLaserUnit(unit?: string | null) {
  return ["sbc", "osasco"].includes(unit?.trim().toLowerCase() || "");
}

export const OSASCO_LIPO_LASER_SOURCE_URLS = [
  "https://www.instagram.com/p/Dei6oHkAR7n/",
  "https://www.instagram.com/p/Dei6eBcgTBI/",
  "https://fb.me/4oiTvM2bA",
  "https://fb.me/4WpaQSwl7",
  "https://www.facebook.com/story.php?story_fbid=1415454654978650&id=100095423860776",
] as const;

export function isLipoLaserCampaignName(name?: string | null) {
  return ["lipo laser", "lipo laser 2"].includes(normalizeCampaignText(name));
}

export function lipoLaserCampaignFromAdId(adId?: string | null, unit?: string | null) {
  if (unit?.trim().toLowerCase() === "osasco") {
    return adId === OSASCO_LIPO_LASER_AD_ID ? LIPO_LASER_CAMPAIGN_NAME : null;
  }
  if (unit?.trim().toLowerCase() !== "sbc") return null;
  if (adId === LIPO_LASER_AD_ID) return LIPO_LASER_CAMPAIGN_NAME;
  if (adId === LIPO_LASER_2_AD_ID) return LIPO_LASER_2_CAMPAIGN_NAME;
  return null;
}

export function lipoLaserCampaignFromSourceUrl(sourceUrl?: string | null, unit?: string | null) {
  if (unit?.trim().toLowerCase() !== "osasco" || !sourceUrl) return null;
  try {
    const url = new URL(sourceUrl);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return null;
    const host = url.hostname.replace(/^(?:www|m)\./, "");
    const path = url.pathname.replace(/\/$/, "");
    const instagramPost = /^(?:\/virtuosaosasco)?\/p\/(Dei6oHkAR7n|Dei6eBcgTBI)$/.test(path);
    const shortLink = ["/4oiTvM2bA", "/4WpaQSwl7"].includes(path);
    const facebookPost = ["/story.php", "/permalink.php"].includes(path)
      && url.searchParams.get("story_fbid") === "1415454654978650";
    return ((host === "instagram.com" && instagramPost)
      || (host === "fb.me" && shortLink)
      || (host === "facebook.com" && facebookPost)) ? LIPO_LASER_CAMPAIGN_NAME : null;
  } catch { return null; }
}

export function lipoLaserCampaignFromPrefilledMessage(message?: string | null, unit?: string | null) {
  if (!isLipoLaserUnit(unit)) return null;
  const normalized = normalizeCampaignText(message);
  if (unit?.trim().toLowerCase() === "osasco") {
    return normalized === "quero saber mais sobre o lipo laser" ? LIPO_LASER_CAMPAIGN_NAME : null;
  }
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
  if (packageOffer && unit?.trim().toLowerCase() !== "sbc") return null;
  return packageOffer ? LIPO_LASER_2_CAMPAIGN_NAME : LIPO_LASER_CAMPAIGN_NAME;
}
