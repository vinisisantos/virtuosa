// import-supabase.mjs — imports dump from /tmp/virtuosa-dump.json into Supabase
import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';

const DUMP_FILE = '/tmp/virtuosa-dump.json';
const log = (msg) => console.log(`[${new Date().toLocaleTimeString('pt-BR')}] ${msg}`);

log('Loading dump...');
const dump = JSON.parse(readFileSync(DUMP_FILE, 'utf-8'));
const total = Object.values(dump).reduce((s, a) => s + a.length, 0);
log(`Found ${total} records. Connecting to Supabase...`);

const db = new PrismaClient();

async function ins(key, records, fn) {
  if (!records?.length) return;
  let ok = 0, skip = 0;
  for (const r of records) {
    try { await fn(r); ok++; } 
    catch (e) {
      if (e.code === 'P2002' || e.code === 'P2003') skip++;
      else { console.error(`  ✗ ${key}[${r.id}]: ${e.message?.slice(0, 120)}`); skip++; }
    }
  }
  log(`  ${key}: ${ok} inserted${skip ? `, ${skip} skipped` : ''}`);
}

// Insert in dependency order
await ins('User', dump.users, (r) => db.user.create({ data: r }));
await ins('PayrollImport', dump.payrollImports, (r) => db.payrollImport.create({ data: r }));
await ins('PayrollEntry', dump.payrollEntries, (r) => db.payrollEntry.create({ data: r }));
await ins('Order', dump.orders, (r) => db.order.create({ data: r }));
await ins('OrderApproval', dump.orderApprovals, (r) => db.orderApproval.create({ data: r }));
await ins('OrderAuditLog', dump.orderAuditLogs, (r) => db.orderAuditLog.create({ data: r }));
await ins('Client', dump.clients, (r) => db.client.create({ data: r }));
await ins('Package', dump.packages, (r) => db.package.create({ data: r }));
await ins('Agendamento', dump.agendamentos, (r) => db.agendamento.create({ data: r }));
await ins('Adiantamento', dump.adiantamentos, (r) => db.adiantamento.create({ data: r }));
await ins('Profissional', dump.profissionais, (r) => db.profissional.create({ data: r }));
await ins('InsumoUpload', dump.insumoUploads, (r) => db.insumoUpload.create({ data: r }));
await ins('ReembolsoTicket', dump.reembolsoTickets, (r) => db.reembolsoTicket.create({ data: r }));
await ins('ReembolsoItem', dump.reembolsoItems, (r) => db.reembolsoItem.create({ data: r }));
await ins('ReembolsoAttachment', dump.reembolsoAttachments, (r) => db.reembolsoAttachment.create({ data: r }));
await ins('ReembolsoAuditLog', dump.reembolsoAuditLogs, (r) => db.reembolsoAuditLog.create({ data: r }));
await ins('MetaConfig', dump.metaConfigs, (r) => db.metaConfig.create({ data: r }));
await ins('MetaLead', dump.metaLeads, (r) => db.metaLead.create({ data: r }));
await ins('SalesPipeline', dump.salesPipelines, (r) => db.salesPipeline.create({ data: r }));
await ins('LeadAssignment', dump.leadAssignments, (r) => db.leadAssignment.create({ data: r }));
await ins('WebhookLog', dump.webhookLogs, (r) => db.webhookLog.create({ data: r }));
await ins('EvolutionConfig', dump.evolutionConfigs, (r) => db.evolutionConfig.create({ data: r }));
await ins('EvolutionChatCache', dump.evolutionChatCaches, (r) => db.evolutionChatCache.create({ data: r }));
await ins('SurveyResponse', dump.surveyResponses, (r) => db.surveyResponse.create({ data: r }));
await ins('ContractTemplate', dump.contractTemplates, (r) => db.contractTemplate.create({ data: r }));
await ins('PushSubscription', dump.pushSubscriptions, (r) => db.pushSubscription.create({ data: r }));
await ins('MercadoLivreConnection', dump.mercadoLivreConnections, (r) => db.mercadoLivreConnection.create({ data: r }));
await ins('MercadoLivreOrder', dump.mercadoLivreOrders, (r) => db.mercadoLivreOrder.create({ data: r }));
await ins('WhatsAppConversation', dump.whatsAppConversations, (r) => db.whatsAppConversation.create({ data: r }));
await ins('WhatsAppMessage', dump.whatsAppMessages, (r) => db.whatsAppMessage.create({ data: r }));
await ins('DigitalContract', dump.digitalContracts, (r) => db.digitalContract.create({ data: r }));
await ins('ActivityLog', dump.activityLogs, (r) => db.activityLog.create({ data: r }));

log('\n✅ IMPORT COMPLETE!');
await db.$disconnect();
