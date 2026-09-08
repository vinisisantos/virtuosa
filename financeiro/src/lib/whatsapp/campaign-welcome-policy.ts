import { savedReplyCampaignKey } from "@/lib/whatsapp/saved-replies";
import { EVALUATION_SCHEDULE_UNIT_CONFIGS } from "@/lib/whatsapp/evaluation-schedule-confirmation-message";
import { renderWhatsAppMessageTemplate } from "@/lib/whatsapp/message-template";

export const CAMPAIGN_WELCOME_TRIGGER = "campaign_welcome";
export const WELCOME_SCHEDULER_KEY = "campaign_welcome_scheduler_v1";
export const WELCOME_LIBRARY_USER_ID = "ce4b1e40-6dea-419d-b65e-05e84e7c1194";
export const WELCOME_AUTHOR = "Automação de recepção";
export const WELCOME_DELAY_MS = 60_000;
export const DEFAULT_WELCOME_GREETING = "Olá! Seja muito bem-vinda(o) à Clínica Virtuosa. ✨\n\nRecebemos seu contato e vamos te ajudar por aqui.";
export const DEFAULT_WELCOME_REPLIES: Record<string, string> = {
  "preenchimento-facial": "c6bea977-6631-48a0-9860-3f71a83d8707",
  "gluteos-perfeito": "b9758eab-09d2-4c69-96d8-826f3b158ec8",
  "barriga-trincada": "cc256074-72be-4ac8-a085-8f2fd9982ffa",
  "harmonizacao-gluteos": "4bd0e406-6d19-4b49-877c-ab6ac6e151a1",
  "combo-harmonizacao": "33be5fb1-87a0-4e0d-b326-e7de209b313a",
  "gluteos-perfeito-120ml": "309c51f6-9f54-4a93-840d-2ee185db157e",
  "harmonizacao-mamas": "a2c55af2-1e7c-4cd5-bf9a-220feeca8064",
};

export type WelcomeConfig = { libraryUserId: string; greeting: string; replyIds: Record<string, string> };
export type WelcomeReply = {
  id: string; userId: string; title: string; content: string;
  category: { userId: string; title: string; campaignName: string | null } | null;
};
export function welcomeUnit(unit: string | null | undefined, instanceId?: string) {
  return EVALUATION_SCHEDULE_UNIT_CONFIGS.find((item) => item.unit === unit && (!instanceId || item.instanceId === instanceId));
}
export function welcomeConfig(value: unknown): WelcomeConfig {
  const config = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const replyIds = config.replyIds && typeof config.replyIds === "object" && !Array.isArray(config.replyIds)
    ? Object.fromEntries(Object.entries(config.replyIds).filter((entry): entry is [string, string] => typeof entry[1] === "string")) : {};
  return { libraryUserId: String(config.libraryUserId || ""), greeting: String(config.greeting || ""), replyIds };
}
export function welcomeReplyKey(reply: WelcomeReply) {
  return reply.category ? savedReplyCampaignKey(reply.category.campaignName?.trim() || reply.category.title) : null;
}
export function renderWelcomeText(text: string, unit: string) {
  const config = welcomeUnit(unit);
  if (!config) return null;
  const rendered = renderWhatsAppMessageTemplate(text.trim(), {
    unit: config.displayUnitName, unitAddress: config.address, unitLocationUrl: config.locationUrl,
  });
  // Nenhum dado pessoal ou marcador não resolvido pode escapar para a recepção automática.
  return rendered && rendered.length <= 4096 && !/[{}]/.test(rendered) ? rendered : null;
}
export function welcomePair(config: WelcomeConfig, campaign: string | null, replies: WelcomeReply[], unit: string) {
  if (config.libraryUserId !== WELCOME_LIBRARY_USER_ID) throw new Error("Biblioteca de recepção inválida.");
  const greeting = renderWelcomeText(config.greeting, unit);
  if (!greeting) throw new Error("Saudação inválida. Use texto sem nome ou variáveis pessoais.");
  const key = savedReplyCampaignKey(campaign || "");
  const reply = replies.find((item) => item.id === config.replyIds[key] && item.userId === config.libraryUserId
    && item.category?.userId === config.libraryUserId && welcomeReplyKey(item) === key);
  const question = reply ? renderWelcomeText(reply.content, unit) : null;
  return { greeting, question, replyId: question ? reply!.id : null, campaignKey: key };
}
export function isFreshWelcomeEvent(input: {
  fromMe: boolean; sendable: boolean; capturesLeads: boolean; unit: string | null;
  instanceId: string; conversationCreatedAt: Date; timestamp: Date; payload: unknown;
}, now = new Date()) {
  if (input.fromMe || !input.sendable || !input.capturesLeads || !welcomeUnit(input.unit, input.instanceId)) return false;
  const payload = input.payload as { event?: unknown; type?: unknown; data?: { type?: unknown } } | null;
  if (/history|append|messages[._]set/i.test(String(payload?.event || "") + " " + String(payload?.type || "") + " " + String(payload?.data?.type || ""))) return false;
  const age = now.getTime() - input.timestamp.getTime();
  const conversationAge = now.getTime() - input.conversationCreatedAt.getTime();
  return Number.isFinite(age) && age >= -30_000 && age <= 120_000 && conversationAge >= 0 && conversationAge <= 120_000;
}
