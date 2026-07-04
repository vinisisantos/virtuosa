export const UNCLASSIFIED_CAMPAIGN_LABEL = "Sem campanha classificada";
export const VIA_LINK_CAMPAIGN_LABEL = "Via link";

export function normalizeCampaignText(value?: string | null) {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function isGenericCampaignName(value?: string | null) {
  const normalized = normalizeCampaignText(value);
  return (
    !normalized ||
    normalized === normalizeCampaignText(VIA_LINK_CAMPAIGN_LABEL) ||
    normalized === normalizeCampaignText(UNCLASSIFIED_CAMPAIGN_LABEL) ||
    normalized === "converse conosco" ||
    normalized === "desconhecido" ||
    normalized === "desconhecida" ||
    normalized === "anuncio no status" ||
    normalized.startsWith("campanha desconhecida")
  );
}

export function isViaLinkCampaignName(value?: string | null) {
  const normalized = normalizeCampaignText(value);
  return (
    normalized === normalizeCampaignText(VIA_LINK_CAMPAIGN_LABEL) ||
    normalized === "via link" ||
    normalized === "campanha desconhecida via link"
  );
}

export function normalizeCampaignNameForWrite(value?: string | null) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (isViaLinkCampaignName(trimmed)) return VIA_LINK_CAMPAIGN_LABEL;
  if (!trimmed || isGenericCampaignName(trimmed)) return null;
  return trimmed;
}

export function campaignFilterIsUnclassified(value?: string | null) {
  return normalizeCampaignText(value) === normalizeCampaignText(UNCLASSIFIED_CAMPAIGN_LABEL);
}

export function campaignNamesMatch(a?: string | null, b?: string | null) {
  return normalizeCampaignText(a) === normalizeCampaignText(b);
}

export function displayCampaignName(value?: string | null) {
  if (isViaLinkCampaignName(value)) return VIA_LINK_CAMPAIGN_LABEL;
  return isGenericCampaignName(value)
    ? UNCLASSIFIED_CAMPAIGN_LABEL
    : normalizeCampaignNameForWrite(value) || UNCLASSIFIED_CAMPAIGN_LABEL;
}
