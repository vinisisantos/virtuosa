import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { prisma } from '@/lib/db';
import { LIPO_LASER_CAMPAIGN_NAME, LIPO_LASER_2_CAMPAIGN_NAME, OSASCO_LIPO_LASER_SOURCE_URLS, lipoLaserCampaignFromSourceUrl } from '@/lib/lipo-laser-campaigns';
import { LIPO_LASER_SAVED_REPLIES } from '@/lib/whatsapp/lipo-laser-saved-replies';
import { normalizeSavedReplyTitle, filterSavedRepliesByCampaign } from '@/lib/whatsapp/saved-replies';
import { WELCOME_LIBRARY_USER_ID } from '@/lib/whatsapp/campaign-welcome-policy';
import { getQualifiedWhatsappLeads } from '@/lib/whatsapp/qualified-leads';

const unit = 'Osasco';
const event = 'configure_osasco_lipo_laser_20261017';
const apply = process.argv.includes('--apply');
const names = [LIPO_LASER_CAMPAIGN_NAME, LIPO_LASER_2_CAMPAIGN_NAME];
const digest = rows => createHash('sha256').update(JSON.stringify(rows)).digest('hex');
const stableId = label => {
  const hash = createHash('sha256').update(`${event}:${label}`).digest('hex');
  return `${hash.slice(0,8)}-${hash.slice(8,12)}-5${hash.slice(13,16)}-a${hash.slice(17,20)}-${hash.slice(20,32)}`;
};
const sourceMarkers = OSASCO_LIPO_LASER_SOURCE_URLS.map(value => {
  const url = new URL(value);
  return url.searchParams.get('story_fbid') || url.pathname.split('/').filter(Boolean).at(-1);
});
const clientSelect = { id: true, unit: true, originUnit: true, arrivedAt: true, createdAt: true, userId: true, source: true, campaignId: true, campaignName: true, fbclid: true };
const invariants = clients => clients.map(client => Object.fromEntries(Object.entries(client).filter(([field]) => field !== 'campaignName')));
const automationQuery = { where: { triggerType: 'campaign_welcome' }, select: { id: true, unit: true, isActive: true, triggerConfig: true }, orderBy: { id: 'asc' } };
async function qualifiedToday() {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  return (await getQualifiedWhatsappLeads({ unit, start: new Date(`${day}T00:00:00-03:00`), end: new Date(`${day}T23:59:59.999-03:00`) })).length;
}

async function inventory(db) {
  const owner = await db.user.findUnique({ where: { id: WELCOME_LIBRARY_USER_ID }, select: { id: true, name: true } });
  assert.equal(owner?.name, 'Claudenice');
  const replies = await db.whatsAppSavedReply.findMany({ where: { userId: owner.id }, orderBy: { id: 'asc' } });
  const categories = await db.whatsAppSavedReplyCategory.findMany({ where: { userId: owner.id }, orderBy: { id: 'asc' } });
  for (const reply of LIPO_LASER_SAVED_REPLIES) assert.ok(replies.some(row => row.normalizedTitle === normalizeSavedReplyTitle(reply.title)), `Missing personal reply: ${reply.title}`);
  const campaigns = await db.campaign.findMany({ where: { unit }, orderBy: { id: 'asc' } });
  const candidates = await db.client.findMany({ where: { unit, OR: sourceMarkers.map(marker => ({ fbclid: { contains: marker } })) }, select: clientSelect, orderBy: { id: 'asc' } });
  // O ID 120253281469150494 é um sinal compartilhado; somente o criativo comprovado autoriza o reparo.
  const clients = candidates.filter(client => lipoLaserCampaignFromSourceUrl(client.fbclid, unit) === LIPO_LASER_CAMPAIGN_NAME);
  return { owner, replies, categories, campaigns, clients };
}

function summarize(data) {
  return {
    campaignsToCreate: names.filter(name => !data.campaigns.some(row => normalizeSavedReplyTitle(row.name) === normalizeSavedReplyTitle(name))),
    clientsToReclassify: data.clients.filter(client => client.campaignName !== LIPO_LASER_CAMPAIGN_NAME),
    library: names.map(name => ({ name, specificReplies: filterSavedRepliesByCampaign(data.replies, name, data.categories).filter(row => row.categoryId).length })),
  };
}

async function configure() {
  const before = await inventory(prisma);
  const plan = summarize(before);
  for (const offer of plan.library) assert.ok(offer.specificReplies >= 3);
  console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', unit, campaignsToCreate: plan.campaignsToCreate, clientsToReclassify: plan.clientsToReclassify.length, verifiedClients: before.clients.length, replies: before.replies.length, categories: before.categories.length, offers: plan.library }));
  if (!apply) return;
  const leadsBefore = await qualifiedToday();
  const automationBefore = await prisma.automation.findMany(automationQuery);
  let changed;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      changed = await prisma.$transaction(async tx => {
        const current = await inventory(tx);
        const missing = summarize(current);
        const counts = { campaigns: 0, replies: 0, categories: 0, clients: 0, pipelineSnapshots: 0 };
        if (missing.campaignsToCreate.length) counts.campaigns = (await tx.campaign.createMany({ data: missing.campaignsToCreate.map(name => ({ id: stableId(`campaign:${name}`), unit, name, platform: 'meta_ads', status: 'ativa', notes: `Mesmas ofertas de SBC autorizadas para Osasco em 17/10/2026. Classificação por criativo confirmado ou texto explícito; sem ID Meta inventado.`, createdBy: current.owner.id })), skipDuplicates: true })).count;
        const ids = current.clients.map(client => client.id);
        if (ids.length) {
          counts.clients = (await tx.client.updateMany({ where: { id: { in: ids }, unit, OR: [{ campaignName: null }, { campaignName: { not: LIPO_LASER_CAMPAIGN_NAME } }] }, data: { campaignName: LIPO_LASER_CAMPAIGN_NAME } })).count;
          counts.pipelineSnapshots = (await tx.salesPipeline.updateMany({ where: { clientId: { in: ids }, unit, OR: [{ campaignNameSnapshot: null }, { campaignNameSnapshot: { not: LIPO_LASER_CAMPAIGN_NAME } }] }, data: { campaignNameSnapshot: LIPO_LASER_CAMPAIGN_NAME } })).count;
        }
        await tx.webhookLog.upsert({ where: { id: stableId('audit') }, create: { id: stableId('audit'), source: 'campaign_configuration', eventType: event, status: 'processed', processedAt: new Date(), payload: JSON.stringify({ unit, ownerId: current.owner.id, confirmedSourceUrls: OSASCO_LIPO_LASER_SOURCE_URLS, changed: counts }) }, update: {} });
        return counts;
      }, { isolationLevel: 'Serializable', timeout: 60000, maxWait: 10000 });
      break;
    } catch (error) { if (attempt === 3 || !['P2002', 'P2034'].includes(error.code)) throw error; }
  }
  const after = await inventory(prisma);
  assert.equal(digest(after.replies), digest(before.replies), 'Personal reply edited or duplicated');
  assert.equal(digest(after.categories), digest(before.categories), 'Personal category edited or duplicated');
  const oldCampaignIds = new Set(before.campaigns.map(row => row.id));
  assert.equal(digest(after.campaigns.filter(row => oldCampaignIds.has(row.id))), digest(before.campaigns), 'Existing Osasco campaign changed');
  const oldClientIds = new Set(before.clients.map(row => row.id));
  assert.equal(digest(invariants(after.clients.filter(row => oldClientIds.has(row.id)))), digest(invariants(before.clients)), 'Lead history/origin changed');
  assert.equal(digest(await prisma.automation.findMany(automationQuery)), digest(automationBefore), 'Reception config changed');
  assert.equal(summarize(after).campaignsToCreate.length, 0);
  assert.equal(summarize(after).clientsToReclassify.length, 0);
  console.log(JSON.stringify({ changed, verifiedClientsAfter: after.clients.length, qualifiedLeadsTodayBefore: leadsBefore, qualifiedLeadsTodayAfter: await qualifiedToday(), libraryPreserved: true, existingCampaignsPreserved: true, leadInvariantsPreserved: true, receptionPreserved: true }));
}

try { await configure(); } finally { await prisma.$disconnect(); }
