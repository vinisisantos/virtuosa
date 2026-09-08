import { prisma } from "@/lib/db";
import { savedReplyCampaignKey } from "@/lib/whatsapp/saved-replies";
import { CAMPAIGN_WELCOME_TRIGGER, WELCOME_LIBRARY_USER_ID, WELCOME_SCHEDULER_KEY, renderWelcomeText, welcomeConfig, welcomePair, welcomeReplyKey, welcomeUnit } from "@/lib/whatsapp/campaign-welcome-policy";

export async function loadWelcomeSettings(unit: string) {
  if (!welcomeUnit(unit)) throw new Error('Unidade inválida.');
  const [automation, library, campaigns, scheduler, recent] = await Promise.all([
    prisma.automation.findUnique({ where: { id: `${CAMPAIGN_WELCOME_TRIGGER}:${unit}` } }),
    prisma.whatsAppSavedReply.findMany({ where: { userId: WELCOME_LIBRARY_USER_ID }, take: 100,
      select: { id: true, userId: true, title: true, content: true, category: { select: { userId: true, title: true, campaignName: true } } }, orderBy: { position: 'asc' } }),
    prisma.campaign.findMany({ where: { unit }, take: 200, select: { name: true } }),
    prisma.appSetting.findUnique({ where: { key: WELCOME_SCHEDULER_KEY }, select: { value: true } }),
    prisma.whatsAppWelcomeJob.findMany({ where: { unit }, take: 20, orderBy: { createdAt: 'desc' }, select: { id: true, status: true, reason: true, campaignKey: true, createdAt: true } }),
  ]);
  const state = scheduler ? JSON.parse(scheduler.value) : {};
  const config = welcomeConfig(automation?.triggerConfig);
  const names = new Map<string, string>();
  for (const { name } of campaigns) if (name?.trim()) names.set(savedReplyCampaignKey(name), name);
  for (const reply of library) {
    const key = welcomeReplyKey(reply);
    if (key && !names.has(key)) names.set(key, reply.category!.campaignName || reply.category!.title);
  }
  return {
    automation, library: library.map((reply) => ({ id: reply.id, title: reply.title, content: reply.content, campaignKey: welcomeReplyKey(reply) })),
    campaigns: [...names].map(([key, name]) => ({ key, name, covered: automation ? !!welcomePair(config, name, library, unit).question : false })).sort((a,b) => a.name.localeCompare(b.name, 'pt-BR')),
    scheduler: { installed: !!state.installedAt, readyAt: state.readyAt || null, lastWorkerAt: state.lastWorkerAt || null }, recent,
  };
}

export async function updateWelcomeSettings(existing: { id: string; unit: string | null; triggerConfig: unknown }, data: Record<string, unknown>) {
  const unit = welcomeUnit(existing.unit);
  if (!unit) throw new Error('Unidade inválida.');
  if (data.isActive !== undefined && typeof data.isActive !== 'boolean') throw new Error('Ativação inválida.');
  const config = welcomeConfig(data.triggerConfig ?? existing.triggerConfig);
  if (config.libraryUserId !== WELCOME_LIBRARY_USER_ID) throw new Error('Use a biblioteca aprovada da Claudenice.');
  if (!renderWelcomeText(config.greeting, unit.unit)) throw new Error('Informe saudação de até 4.096 caracteres, sem nome ou variáveis pessoais.');
  const ids = Object.values(config.replyIds).filter(Boolean);
  if (ids.length > 100) throw new Error('Limite de 100 associações.');
  const replies = await prisma.whatsAppSavedReply.findMany({ where: { userId: WELCOME_LIBRARY_USER_ID, id: { in: ids } },
    select: { id: true, userId: true, title: true, content: true, category: { select: { userId: true, title: true, campaignName: true } } } });
  for (const [key, id] of Object.entries(config.replyIds)) {
    if (!id) continue;
    const reply = replies.find((item) => item.id === id);
    if (!reply || reply.category?.userId !== WELCOME_LIBRARY_USER_ID || welcomeReplyKey(reply) !== key || !renderWelcomeText(reply.content, unit.unit)) {
      throw new Error('A resposta deve pertencer à campanha e à biblioteca aprovada, sem variáveis pessoais. Remova associações inválidas.');
    }
  }
  return prisma.automation.update({ where: { id: existing.id }, data: {
    triggerConfig: { ...config }, steps: [{ type: 'wait', config: { seconds: 60 } }, { type: 'send_message', config: { message: config.greeting } }],
    ...(typeof data.isActive === 'boolean' ? { isActive: data.isActive } : {}),
  } });
}
