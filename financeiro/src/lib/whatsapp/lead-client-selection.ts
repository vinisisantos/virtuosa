import { isGenericCampaignName } from "@/lib/campaign-labels";
import { type CampaignClientCandidate, pickBestCampaignClient } from "@/lib/campaign-client-selection";

type UnitClient = CampaignClientCandidate & { phone?: string | null; unit?: string | null };

export function campaignPhoneKey(value?: string | null) {
  if (!value || /lid|@g\.us/i.test(value)) return "";
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("55") && digits.length > 11) digits = digits.slice(2);
  // Preserva o DDD; o sufixo de oito dígitos serve só para pré-filtrar a query.
  if (/^\d{2}9\d{8}$/.test(digits)) digits = digits.slice(0, 2) + digits.slice(3);
  return digits.length >= 10 ? digits : "";
}

export function campaignClientKey(phone?: string | null, unit?: string | null) {
  const key = campaignPhoneKey(phone);
  const scope = unit?.trim().toLowerCase();
  return key && scope && !["todas", "all"].includes(scope) ? `${scope}:${key}` : "";
}

export function pickCampaignClientForUnit<T extends UnitClient>(candidates: T[], phone: string, unit: string) {
  const key = campaignClientKey(phone, unit);
  return key ? pickBestCampaignClient(candidates.filter(c => campaignClientKey(c.phone, c.unit) === key)) : null;
}

export function pickLeadClientForUnit<T extends UnitClient>(candidates: T[], params: { contactPhone: string; leadUnit: string; hasCampaignSignal: boolean }) {
  const key = campaignClientKey(params.contactPhone, params.leadUnit);
  if (!key) return null;
  const digits = params.contactPhone.replace(/\D/g, "");
  return candidates
    .filter(c => campaignClientKey(c.phone, c.unit) === key)
    .map((client, index) => {
      let score = client.phone?.replace(/\D/g, "") === digits ? 120 : 40;
      if (params.hasCampaignSignal) {
        score += isGenericCampaignName(client.campaignName) ? 5 : 35;
        if (/^https?:\/\//i.test(client.fbclid || "")) score += 20;
        if (client.campaignId) score += 15;
        if (client.source === "facebook_ad") score += 10;
      }
      return { client, index, score };
    })
    .sort((a, b) => b.score - a.score || new Date(b.client.updatedAt || 0).getTime() - new Date(a.client.updatedAt || 0).getTime() || a.index - b.index)[0]?.client || null;
}
