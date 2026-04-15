/**
 * migrate-to-supabase.mjs
 * Exports data from MySQL via Prisma, then imports into Supabase
 * 
 * Usage:
 *   Phase 1 (export): DATABASE_URL_MYSQL node scripts/migrate-to-supabase.mjs export
 *   Phase 2 (import): DATABASE_URL_PG node scripts/migrate-to-supabase.mjs import
 */

import { PrismaClient } from '@prisma/client';
import { writeFileSync, readFileSync, existsSync } from 'fs';

const DUMP_FILE = '/tmp/virtuosa-dump.json';
const mode = process.argv[2] || 'export';

const log = (msg) => console.log(`[${new Date().toLocaleTimeString('pt-BR')}] ${msg}`);

// ─── EXPORT (from MySQL) ──────────────────────────────────────────────
async function exportData() {
  log('Connecting to MySQL...');
  const db = new PrismaClient();
  
  const dump = {};
  const tables = [
    ['users', () => db.user.findMany()],
    ['payrollImports', () => db.payrollImport.findMany()],
    ['payrollEntries', () => db.payrollEntry.findMany()],
    ['orders', () => db.order.findMany()],
    ['orderApprovals', () => db.orderApproval.findMany()],
    ['orderAuditLogs', () => db.orderAuditLog.findMany()],
    ['clients', () => db.client.findMany()],
    ['packages', () => db.package.findMany()],
    ['sessions', () => db.session.findMany()],
    ['agendamentos', () => db.agendamento.findMany()],
    ['adiantamentos', () => db.adiantamento.findMany()],
    ['profissionais', () => db.profissional.findMany()],
    ['procedimentos', () => db.procedimento.findMany()],
    ['financeiros', () => db.financeiro.findMany()],
    ['checkins', () => db.checkin.findMany()],
    ['insumoUploads', () => db.insumoUpload.findMany()],
    ['reembolsoTickets', () => db.reembolsoTicket.findMany()],
    ['reembolsoItems', () => db.reembolsoItem.findMany()],
    ['reembolsoAttachments', () => db.reembolsoAttachment.findMany()],
    ['reembolsoAuditLogs', () => db.reembolsoAuditLog.findMany()],
    ['metaConfigs', () => db.metaConfig.findMany()],
    ['metaLeads', () => db.metaLead.findMany()],
    ['salesPipelines', () => db.salesPipeline.findMany()],
    ['leadAssignments', () => db.leadAssignment.findMany()],
    ['webhookLogs', () => db.webhookLog.findMany()],
    ['evolutionConfigs', () => db.evolutionConfig.findMany()],
    ['evolutionChatCaches', () => db.evolutionChatCache.findMany()],
    ['surveyResponses', () => db.surveyResponse.findMany()],
    ['contractTemplates', () => db.contractTemplate.findMany()],
    ['pushSubscriptions', () => db.pushSubscription.findMany()],
    ['mercadoLivreConnections', () => db.mercadoLivreConnection.findMany()],
    ['mercadoLivreOrders', () => db.mercadoLivreOrder.findMany()],
  ];

  // Optional tables (may not exist in all versions)
  const optionalTables = [
    ['whatsAppConversations', () => db.whatsAppConversation.findMany()],
    ['whatsAppMessages', () => db.whatsAppMessage.findMany()],
    ['activityLogs', () => db.activityLog.findMany()],
    ['photos', () => db.photo.findMany()],
    ['stockItems', () => db.stockItem.findMany()],
    ['catalogItems', () => db.catalogItem.findMany()],
    ['loyaltyCards', () => db.loyaltyCard.findMany()],
    ['loyaltyStamps', () => db.loyaltyStamp.findMany()],
    ['serviceChecklists', () => db.serviceChecklist.findMany()],
    ['checklistItems', () => db.checklistItem.findMany()],
    ['digitalContracts', () => db.digitalContract.findMany()],
    ['insumos', () => db.insumo?.findMany()],
    ['communications', () => db.communication?.findMany()],
    ['notifications', () => db.notification?.findMany()],
    ['reminders', () => db.reminder?.findMany()],
  ];

  for (const [name, fn] of tables) {
    try {
      const data = await fn();
      dump[name] = data;
      log(`  ✓ ${name}: ${data.length} records`);
    } catch (e) {
      log(`  ✗ ${name}: ${e.message.slice(0, 80)}`);
      dump[name] = [];
    }
  }

  for (const [name, fn] of optionalTables) {
    try {
      const data = await fn();
      dump[name] = data;
      if (data.length > 0) log(`  ✓ ${name}: ${data.length} records`);
    } catch {
      dump[name] = [];
    }
  }

  writeFileSync(DUMP_FILE, JSON.stringify(dump, null, 2));
  const totalRecords = Object.values(dump).reduce((s, a) => s + a.length, 0);
  log(`\n✅ Export complete! ${totalRecords} total records → ${DUMP_FILE}`);
  await db.$disconnect();
}

// ─── IMPORT (to Supabase) ─────────────────────────────────────────────
async function importData() {
  if (!existsSync(DUMP_FILE)) {
    log(`ERROR: Dump file not found at ${DUMP_FILE}. Run 'export' first.`);
    process.exit(1);
  }

  log('Loading dump file...');
  const dump = JSON.parse(readFileSync(DUMP_FILE, 'utf-8'));
  const totalRecords = Object.values(dump).reduce((s, a) => s + a.length, 0);
  log(`Found ${totalRecords} records to import`);

  log('Connecting to Supabase...');
  const db = new PrismaClient();

  async function insert(name, records, createFn) {
    if (!records || records.length === 0) return;
    let ok = 0, skip = 0;
    for (const r of records) {
      try {
        await createFn(r);
        ok++;
      } catch (e) {
        if (e.code === 'P2002' || e.code === 'P2003') skip++;
        else { console.error(`  ✗ ${name}[${r.id}]: ${e.message?.slice(0, 100)}`); skip++; }
      }
    }
    log(`  ${name}: ${ok} inserted${skip > 0 ? `, ${skip} skipped` : ''}`);
  }

  // Insert in dependency order (parents before children)
  await insert('User', dump.users, (r) => db.user.create({ data: r }));
  await insert('PayrollImport', dump.payrollImports, (r) => db.payrollImport.create({ data: r }));
  await insert('PayrollEntry', dump.payrollEntries, (r) => db.payrollEntry.create({ data: r }));
  await insert('Order', dump.orders, (r) => db.order.create({ data: r }));
  await insert('OrderApproval', dump.orderApprovals, (r) => db.orderApproval.create({ data: r }));
  await insert('OrderAuditLog', dump.orderAuditLogs, (r) => db.orderAuditLog.create({ data: r }));
  await insert('Client', dump.clients, (r) => db.client.create({ data: r }));
  await insert('Package', dump.packages, (r) => db.package.create({ data: r }));
  await insert('Session', dump.sessions, (r) => db.session.create({ data: r }));
  await insert('Agendamento', dump.agendamentos, (r) => db.agendamento.create({ data: r }));
  await insert('Adiantamento', dump.adiantamentos, (r) => db.adiantamento.create({ data: r }));
  await insert('Profissional', dump.profissionais, (r) => db.profissional.create({ data: r }));
  await insert('Procedimento', dump.procedimentos, (r) => db.procedimento.create({ data: r }));
  await insert('Financeiro', dump.financeiros, (r) => db.financeiro.create({ data: r }));
  await insert('Checkin', dump.checkins, (r) => db.checkin.create({ data: r }));
  await insert('InsumoUpload', dump.insumoUploads, (r) => db.insumoUpload.create({ data: r }));
  await insert('ReembolsoTicket', dump.reembolsoTickets, (r) => db.reembolsoTicket.create({ data: r }));
  await insert('ReembolsoItem', dump.reembolsoItems, (r) => db.reembolsoItem.create({ data: r }));
  await insert('ReembolsoAttachment', dump.reembolsoAttachments, (r) => db.reembolsoAttachment.create({ data: r }));
  await insert('ReembolsoAuditLog', dump.reembolsoAuditLogs, (r) => db.reembolsoAuditLog.create({ data: r }));
  await insert('MetaConfig', dump.metaConfigs, (r) => db.metaConfig.create({ data: r }));
  await insert('MetaLead', dump.metaLeads, (r) => db.metaLead.create({ data: r }));
  await insert('SalesPipeline', dump.salesPipelines, (r) => db.salesPipeline.create({ data: r }));
  await insert('LeadAssignment', dump.leadAssignments, (r) => db.leadAssignment.create({ data: r }));
  await insert('WebhookLog', dump.webhookLogs, (r) => db.webhookLog.create({ data: r }));
  await insert('EvolutionConfig', dump.evolutionConfigs, (r) => db.evolutionConfig.create({ data: r }));
  await insert('EvolutionChatCache', dump.evolutionChatCaches, (r) => db.evolutionChatCache.create({ data: r }));
  await insert('SurveyResponse', dump.surveyResponses, (r) => db.surveyResponse.create({ data: r }));
  await insert('ContractTemplate', dump.contractTemplates, (r) => db.contractTemplate.create({ data: r }));
  await insert('PushSubscription', dump.pushSubscriptions, (r) => db.pushSubscription.create({ data: r }));
  await insert('MercadoLivreConnection', dump.mercadoLivreConnections, (r) => db.mercadoLivreConnection.create({ data: r }));
  await insert('MercadoLivreOrder', dump.mercadoLivreOrders, (r) => db.mercadoLivreOrder.create({ data: r }));
  await insert('WhatsAppConversation', dump.whatsAppConversations, (r) => db.whatsAppConversation.create({ data: r }));
  await insert('WhatsAppMessage', dump.whatsAppMessages, (r) => db.whatsAppMessage.create({ data: r }));
  await insert('Photo', dump.photos, (r) => db.photo.create({ data: r }));
  await insert('StockItem', dump.stockItems, (r) => db.stockItem.create({ data: r }));
  await insert('CatalogItem', dump.catalogItems, (r) => db.catalogItem.create({ data: r }));
  await insert('LoyaltyCard', dump.loyaltyCards, (r) => db.loyaltyCard.create({ data: r }));
  await insert('LoyaltyStamp', dump.loyaltyStamps, (r) => db.loyaltyStamp.create({ data: r }));
  await insert('ServiceChecklist', dump.serviceChecklists, (r) => db.serviceChecklist.create({ data: r }));
  await insert('ChecklistItem', dump.checklistItems, (r) => db.checklistItem.create({ data: r }));
  await insert('DigitalContract', dump.digitalContracts, (r) => db.digitalContract.create({ data: r }));
  await insert('ActivityLog', dump.activityLogs, (r) => db.activityLog.create({ data: r }));

  log('\n✅ Import complete!');
  await db.$disconnect();
}

if (mode === 'export') await exportData();
else if (mode === 'import') await importData();
else { log('Usage: node scripts/migrate-to-supabase.mjs [export|import]'); process.exit(1); }
