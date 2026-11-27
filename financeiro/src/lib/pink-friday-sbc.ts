const offers = [
  { key: "botox", name: "BOTOX PINK FRIDAY", metaId: "120251255419000006", document: "knowledge/pink-friday-sbc-botox.md", opening: null },
  { key: "gluteos", name: "GLÚTEOS PERFEITOS PINK FRIDAY", metaId: "120251255483450006", document: "knowledge/pink-friday-sbc-gluteos.md",
    opening: "Olá! Eu vim pelo GLÚTEOS PERFEITOS PINK FRIDAY, e quero mais informações!" },
  { key: "combo", name: "COMBO PINK FRIDAY", metaId: "120251255549180006", document: "knowledge/pink-friday-sbc-combo.md",
    opening: "Quero mais informações sobre o COMBO PINK FRIDAY!" },
  { key: "endolaser", name: "ENDOLASER PINK FRIDAY", metaId: "120251255510210006", document: "knowledge/pink-friday-sbc-endolaser.md",
    opening: "Olá! Vim pelo ENDOLASER PINK FRIDAY, posso ter mais informações sobre isso?" },
] as const;

export type PinkFridaySbcOffer = typeof offers[number];
export const PINK_FRIDAY_SBC_RULES = "knowledge/pink-friday-sbc.md";
export const PINK_FRIDAY_SBC_PRICES_HEADING = "## Pink Friday SBC — novembro de 2026";
export const PINK_FRIDAY_SBC_END = "2026-11-30T00:00:00-03:00";

const normalized = (value?: string | null) => value?.normalize("NFD").replace(/\p{Diacritic}/gu, "").trim().toLowerCase();

export function pinkFridaySbcOffer(unit?: string | null, campaignName?: string | null, metaId?: string | null) {
  if (normalized(unit) !== "sbc") return null;
  if (metaId) return offers.find((offer) => offer.metaId === metaId.trim()) || null;
  return offers.find((offer) => normalized(offer.name) === normalized(campaignName)) || null;
}

export function pinkFridaySbcOfferFromPrefilledMessage(message?: string | null, unit?: string | null) {
  if (normalized(unit) !== "sbc" || !message) return null;
  const words = (value: string) => normalized(value)?.replace(/[^a-z0-9]+/g, " ").trim();
  const text = words(message);
  return offers.find((offer) => offer.opening && words(offer.opening) === text) || null;
}

export function pinkFridaySbcActive(now = new Date()) {
  return Number.isFinite(now.getTime()) && now.getTime() < Date.parse(PINK_FRIDAY_SBC_END);
}

export function pinkFridaySbcPromptOffer(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const prompt = input as Record<string, unknown>;
  return pinkFridaySbcOffer(typeof prompt.UNIDADE === "string" ? prompt.UNIDADE : null,
    typeof prompt.CAMPANHA === "string" ? prompt.CAMPANHA : null);
}

export function pinkFridaySbcPromptNow(input: unknown) {
  const prompt = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const time = prompt.TEMPO_CONVERSA as { agora?: unknown } | undefined;
  return typeof time?.agora === "string" && Number.isFinite(Date.parse(time.agora)) ? new Date(time.agora) : new Date();
}
