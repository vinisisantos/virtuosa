import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { prisma } from '@/lib/db';
import { LIPO_LASER_AD_ID, LIPO_LASER_2_AD_ID, LIPO_LASER_CAMPAIGN_NAME, LIPO_LASER_2_CAMPAIGN_NAME } from '@/lib/lipo-laser-campaigns';
import { LIPO_LASER_SAVED_REPLIES } from '@/lib/whatsapp/lipo-laser-saved-replies';
import { normalizeSavedReplyTitle, validateSavedReplyInput, filterSavedRepliesByCampaign, SAVED_REPLY_MAX_PER_USER, SAVED_REPLY_CATEGORY_MAX_PER_USER } from '@/lib/whatsapp/saved-replies';
import { WELCOME_LIBRARY_USER_ID } from '@/lib/whatsapp/campaign-welcome-policy';
import { getQualifiedWhatsappLeads } from '@/lib/whatsapp/qualified-leads';

const unit = 'SBC';
const event = 'configure_sbc_lipo_laser_20261016';
const offers = [{ id: LIPO_LASER_AD_ID, name: LIPO_LASER_CAMPAIGN_NAME }, { id: LIPO_LASER_2_AD_ID, name: LIPO_LASER_2_CAMPAIGN_NAME }];
const apply = process.argv.includes('--apply');
const digest = rows => createHash('sha256').update(JSON.stringify(rows)).digest('hex');
const stableId = label => {
  const hash = createHash('sha256').update(`${event}:${label}`).digest('hex');
  return `${hash.slice(0,8)}-${hash.slice(8,12)}-5${hash.slice(13,16)}-a${hash.slice(17,20)}-${hash.slice(20,32)}`;
};
const clientSelect = { id: true, unit: true, originUnit: true, arrivedAt: true, createdAt: true, userId: true, source: true, campaignId: true, campaignName: true };
const invariantClients = clients => clients.map(client => Object.fromEntries(Object.entries(client).filter(([field]) => field !== 'campaignName')));
const currentDay = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const qualifiedToday = async () => (await getQualifiedWhatsappLeads({ unit, start: new Date(`${currentDay()}T00:00:00-03:00`), end: new Date(`${currentDay()}T23:59:59.999-03:00`) })).length;

async function inventory(db) {
  const owner = await db.user.findUnique({ where: { id: WELCOME_LIBRARY_USER_ID }, select: { id: true, name: true } });
  assert.equal(owner?.name, 'Claudenice');
  const replies = await db.whatsAppSavedReply.findMany({ where: { userId: owner.id }, orderBy: { id: 'asc' } });
  const categories = await db.whatsAppSavedReplyCategory.findMany({ where: { userId: owner.id }, orderBy: { id: 'asc' } });
  const campaigns = await db.campaign.findMany({ where: { unit, name: { in: offers.map(offer => offer.name), mode: 'insensitive' } }, select: { id: true, name: true, unit: true } });
  const clients = await db.client.findMany({ where: { unit, campaignId: { in: offers.map(offer => offer.id) } }, select: clientSelect, orderBy: { id: 'asc' } });
  return { owner, replies, categories, campaigns, clients };
}

function summarize(data) {
  const missingReplies = LIPO_LASER_SAVED_REPLIES.filter(reply => !data.replies.some(row => row.normalizedTitle === normalizeSavedReplyTitle(reply.title)));
  const missingCategories = offers.filter(offer => !data.categories.some(row => row.normalizedTitle === normalizeSavedReplyTitle(offer.name)));
  assert.ok(data.replies.length + missingReplies.length <= SAVED_REPLY_MAX_PER_USER);
  assert.ok(data.categories.length + missingCategories.length <= SAVED_REPLY_CATEGORY_MAX_PER_USER);
  return { missingReplies, missingCategories, campaignsToCreate: offers.filter(offer => !data.campaigns.some(row => normalizeSavedReplyTitle(row.name) === normalizeSavedReplyTitle(offer.name))), clientsToReclassify: data.clients.filter(client => client.campaignName !== offers.find(offer => offer.id === client.campaignId)?.name) };
}

async function configure() {
  const before = await inventory(prisma);
  const plan = summarize(before);
  console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', unit, library: before.owner.name, repliesBefore: before.replies.length, categoriesBefore: before.categories.length, campaignsToCreate: plan.campaignsToCreate.length, categoriesToCreate: plan.missingCategories.length, repliesToCreate: plan.missingReplies.map(row => row.title), clientsToReclassify: plan.clientsToReclassify.length }));
  for (const reply of LIPO_LASER_SAVED_REPLIES) assert.ok(!('error' in validateSavedReplyInput({ ...reply, categoryId: 'preview' })));
  if (!apply) return;
  const leadsBefore = await qualifiedToday();
  const automationQuery = { where: { triggerType: 'campaign_welcome' }, select: { id: true, unit: true, isActive: true, triggerConfig: true }, orderBy: { id: 'asc' } };
  const automationBefore = await prisma.automation.findMany(automationQuery);
  let changed;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      changed = await prisma.$transaction(async tx => {
        const current = await inventory(tx);
        const missing = summarize(current);
        const counts = { campaigns: 0, categories: 0, replies: 0, clients: 0, pipelineSnapshots: 0 };
        if (missing.campaignsToCreate.length) counts.campaigns = (await tx.campaign.createMany({ data: missing.campaignsToCreate.map(offer => ({ id: stableId(`campaign:${offer.name}`), unit, name: offer.name, platform: 'meta_ads', status: 'ativa', notes: `Oferta confirmada em 16/10/2026. Anúncio Meta ${offer.id}.`, createdBy: current.owner.id })), skipDuplicates: true })).count;
        if (missing.missingCategories.length) counts.categories = (await tx.whatsAppSavedReplyCategory.createMany({ data: missing.missingCategories.map(offer => ({ id: stableId(`category:${offer.name}`), userId: current.owner.id, title: offer.name, normalizedTitle: normalizeSavedReplyTitle(offer.name), campaignName: offer.name })), skipDuplicates: true })).count;
        const categoryRows = await tx.whatsAppSavedReplyCategory.findMany({ where: { userId: current.owner.id, normalizedTitle: { in: offers.map(offer => normalizeSavedReplyTitle(offer.name)) } } });
        const position = Math.max(-1, ...current.replies.map(row => row.position));
        const newReplies = missing.missingReplies.map((reply, index) => {
          const category = categoryRows.find(row => row.normalizedTitle === normalizeSavedReplyTitle(reply.campaignName));
          assert.equal(category?.campaignName, reply.campaignName, 'Existing category association differs');
          const parsed = validateSavedReplyInput({ ...reply, categoryId: category.id });
          assert.ok('value' in parsed);
          return { ...parsed.value, id: stableId(`reply:${reply.title}`), userId: current.owner.id, position: position + index + 1 };
        });
        if (newReplies.length) counts.replies = (await tx.whatsAppSavedReply.createMany({ data: newReplies, skipDuplicates: true })).count;
        for (const offer of offers) {
          const ids = current.clients.filter(client => client.campaignId === offer.id).map(client => client.id);
          if (!ids.length) continue;
          counts.clients += (await tx.client.updateMany({ where: { id: { in: ids }, unit, campaignId: offer.id, OR: [{ campaignName: null }, { campaignName: { not: offer.name } }] }, data: { campaignName: offer.name } })).count;
          counts.pipelineSnapshots += (await tx.salesPipeline.updateMany({ where: { unit, clientId: { in: ids }, OR: [{ campaignNameSnapshot: null }, { campaignNameSnapshot: { not: offer.name } }] }, data: { campaignNameSnapshot: offer.name } })).count;
        }
        await tx.webhookLog.upsert({ where: { id: stableId('audit') }, create: { id: stableId('audit'), source: 'campaign_configuration', eventType: event, status: 'processed', processedAt: new Date(), payload: JSON.stringify({ unit, ownerId: current.owner.id, offers, changed: counts }) }, update: {} });
        return counts;
      }, { isolationLevel: 'Serializable', timeout: 60000, maxWait: 10000 });
      break;
    } catch (error) { if (attempt === 3 || !['P2002','P2034'].includes(error.code)) throw error; }
  }
  const after = await inventory(prisma);
  const oldIds = new Set(before.replies.map(row => row.id));
  assert.equal(digest(after.replies.filter(row => oldIds.has(row.id))), digest(before.replies), 'Existing personal replies changed');
  const oldClientIds = new Set(before.clients.map(row => row.id));
  assert.equal(digest(invariantClients(after.clients.filter(row => oldClientIds.has(row.id)))), digest(invariantClients(before.clients)), 'Lead origin/arrival/assignment changed');
  assert.equal(digest(await prisma.automation.findMany(automationQuery)), digest(automationBefore), 'Reception config changed');
  assert.equal(summarize(after).missingReplies.length, 0);
  assert.equal(summarize(after).missingCategories.length, 0);
  assert.equal(summarize(after).campaignsToCreate.length, 0);
  assert.equal(summarize(after).clientsToReclassify.length, 0);
  const counts = offers.map(offer => ({ name: offer.name, clients: after.clients.filter(row => row.campaignName === offer.name).length, specificReplies: filterSavedRepliesByCampaign(after.replies, offer.name, after.categories).filter(row => row.categoryId).length }));
  for (const offer of counts) assert.equal(offer.specificReplies, 3);
  console.log(JSON.stringify({ changed, repliesAfter: after.replies.length, categoriesAfter: after.categories.length, offers: counts, qualifiedLeadsTodayBefore: leadsBefore, qualifiedLeadsTodayAfter: await qualifiedToday(), existingRepliesPreserved: true, leadInvariantsPreserved: true, receptionPreserved: true }));
}

try { await configure(); } finally { await prisma.$disconnect(); }
