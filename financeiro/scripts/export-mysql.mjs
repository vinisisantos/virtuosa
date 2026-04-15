// export-mysql.mjs — load dotenv first then run export
import { config } from 'dotenv';
config({ path: '/tmp/.env.mysql', override: true });

import { PrismaClient } from '@prisma/client';
import { writeFileSync } from 'fs';

const DUMP_FILE = '/tmp/virtuosa-dump.json';
const log = (msg) => console.log(`[${new Date().toLocaleTimeString('pt-BR')}] ${msg}`);

log('Connecting to MySQL: ' + process.env.DATABASE_URL?.slice(0, 40));
const db = new PrismaClient();

const dump = {};
async function pull(key, fn) {
  try {
    const data = await fn();
    dump[key] = data;
    log(`  ✓ ${key}: ${data.length}`);
  } catch (e) {
    log(`  ✗ ${key}: ${e.message?.slice(0, 80)}`);
    dump[key] = [];
  }
}

await pull('users', () => db.user.findMany());
await pull('payrollImports', () => db.payrollImport.findMany());
await pull('payrollEntries', () => db.payrollEntry.findMany());
await pull('orders', () => db.order.findMany());
await pull('orderApprovals', () => db.orderApproval.findMany());
await pull('orderAuditLogs', () => db.orderAuditLog.findMany());
await pull('clients', () => db.client.findMany());
await pull('packages', () => db.package.findMany());
await pull('sessions', () => db.session.findMany());
await pull('agendamentos', () => db.agendamento.findMany());
await pull('adiantamentos', () => db.adiantamento.findMany());
await pull('profissionais', () => db.profissional.findMany());
await pull('procedimentos', () => db.procedimento.findMany());
await pull('financeiros', () => db.financeiro.findMany());
await pull('checkins', () => db.checkin.findMany());
await pull('insumoUploads', () => db.insumoUpload.findMany());
await pull('reembolsoTickets', () => db.reembolsoTicket.findMany());
await pull('reembolsoItems', () => db.reembolsoItem.findMany());
await pull('reembolsoAttachments', () => db.reembolsoAttachment.findMany());
await pull('reembolsoAuditLogs', () => db.reembolsoAuditLog.findMany());
await pull('metaConfigs', () => db.metaConfig.findMany());
await pull('metaLeads', () => db.metaLead.findMany());
await pull('salesPipelines', () => db.salesPipeline.findMany());
await pull('leadAssignments', () => db.leadAssignment.findMany());
await pull('webhookLogs', () => db.webhookLog.findMany());
await pull('evolutionConfigs', () => db.evolutionConfig.findMany());
await pull('evolutionChatCaches', () => db.evolutionChatCache.findMany());
await pull('surveyResponses', () => db.surveyResponse.findMany());
await pull('contractTemplates', () => db.contractTemplate.findMany());
await pull('pushSubscriptions', () => db.pushSubscription.findMany());
await pull('mercadoLivreConnections', () => db.mercadoLivreConnection.findMany());
await pull('mercadoLivreOrders', () => db.mercadoLivreOrder.findMany());
await pull('whatsAppConversations', () => db.whatsAppConversation.findMany());
await pull('whatsAppMessages', () => db.whatsAppMessage.findMany());
await pull('photos', () => db.photo.findMany());
await pull('stockItems', () => db.stockItem.findMany());
await pull('catalogItems', () => db.catalogItem.findMany());
await pull('loyaltyCards', () => db.loyaltyCard.findMany());
await pull('loyaltyStamps', () => db.loyaltyStamp.findMany());
await pull('serviceChecklists', () => db.serviceChecklist.findMany());
await pull('checklistItems', () => db.checklistItem.findMany());
await pull('digitalContracts', () => db.digitalContract.findMany());
await pull('activityLogs', () => db.activityLog.findMany());

const total = Object.values(dump).reduce((s, a) => s + a.length, 0);
writeFileSync(DUMP_FILE, JSON.stringify(dump, null, 2));
log(`\n✅ EXPORT COMPLETE — ${total} total records → ${DUMP_FILE}`);
await db.$disconnect();
