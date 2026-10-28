import { prisma } from '@/lib/db';
import { Prisma } from '@prisma/client';
import { filterDealsByPipelineOwnerScope, type PipelineOwnerScope } from '@/lib/pipeline-owner-scope';
import { getPipelineProcedureSelections } from '@/lib/pipeline/procedure-audit';
import { phoneLookupKey } from '@/lib/phone';
import { campaignClientKey } from '@/lib/whatsapp/lead-client-selection';
import { normalizedPhoneKeySql } from '@/lib/whatsapp/phone-sql';
import { buildClientClosing, type ClientReport, type ReportClientRecord } from '@/lib/whatsapp/client-report';

export class ClientReportError extends Error {
  readonly status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}

type ReportAccess = {
  conversationId: string; unit: string; instanceId: string; ownerUserId: string;
  managesSharedInstance: boolean;
};

export async function loadClientReport(access: ReportAccess): Promise<ClientReport> {
  // One snapshot keeps item values and the closing total consistent during edits.
  const snapshot = await prisma.$transaction(async tx => {
    const conversation = await tx.whatsAppConversation.findFirst({
      where: { id: access.conversationId, instanceId: access.instanceId },
      select: { contact: { select: { phone: true, name: true } } },
    });
    if (!conversation) throw new ClientReportError('Conversa não encontrada ou sem acesso.', 404);
    const phone = conversation.contact.phone;
    const key = campaignClientKey(phone, access.unit);
    if (!key) throw new ClientReportError('Este contato ainda não possui um telefone vinculado. Vincule o cliente antes de gerar o relatório.', 422);
    const suffix = phone.replace(/\D/g, '').slice(-8);
    // Unit first, bounded candidates, then the full DDD-aware key below.
    // Reuse the SQL normalizer so formatted legacy phones are not missed.
    const candidates = await tx.$queryRaw<Array<ReportClientRecord & { phone: string | null }>>(Prisma.sql`
      SELECT c.id, c.name, c.phone, c."campaignName", c."campaignAttribution", c.fbclid FROM "Client" c
      WHERE (c.unit = ${access.unit} OR c.id IN (
        SELECT "clientId" FROM "SalesPipeline" WHERE unit = ${access.unit} AND stage = 'fechado'
      )) AND right(${normalizedPhoneKeySql(Prisma.sql`c.phone`)}, 8) = ${suffix}
      ORDER BY c.id LIMIT 21
    `);
    if (candidates.length > 20) throw new ClientReportError('Há muitos cadastros associados a este telefone. Confira os cadastros no CRM.', 409);
    const clients = candidates.filter(client => campaignClientKey(client.phone, access.unit) === key);
    const deals = clients.length ? await tx.salesPipeline.findMany({
      where: { clientId: { in: clients.map(client => client.id) }, unit: access.unit, stage: 'fechado' },
      select: {
        id: true, clientId: true, clientName: true, unit: true, stage: true, stageId: true,
        assignedTo: true, value: true, closedAt: true,
        campaignNameSnapshot: true, campaignAttributionSnapshot: true,
        saleItems: { select: { procedureName: true, sessions: true, paidAmount: true, itemType: true }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
      },
      orderBy: [{ closedAt: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }], take: 101,
    }) : [];
    if (deals.length > 100) throw new ClientReportError('O histórico excede 100 fechamentos. Consulte as vendas no Pipeline.', 409);
    const legacy = deals.filter(deal => !deal.saleItems.length);
    const names = await getPipelineProcedureSelections(tx, legacy.map(deal => deal.id));
    return { clients, deals, names, phone, contactName: conversation.contact.name || 'Nome não cadastrado' };
  }, { isolationLevel: 'RepeatableRead', timeout: 10_000 });

  const phoneKey = phoneLookupKey(snapshot.phone);
  // Existing handoff rules only grant the scheduled stage, never closed sales.
  // Limit this scope to the validated conversation instead of loading every chat.
  const scope: PipelineOwnerScope = {
    ownerUserId: access.ownerUserId, instanceIds: [access.instanceId], handoffRules: [],
    phoneKeys: new Set(phoneKey ? [phoneKey] : []),
    managedPhoneKeys: new Set(access.managesSharedInstance && phoneKey ? [phoneKey] : []),
  };
  const visibleDeals = await filterDealsByPipelineOwnerScope(snapshot.deals, scope);
  const byClient = new Map(snapshot.clients.map(client => [client.id, client]));
  return {
    conversationId: access.conversationId, unit: access.unit,
    contactName: snapshot.contactName, generatedAt: new Date().toISOString(),
    multipleClients: new Set(visibleDeals.map(deal => deal.clientId)).size > 1,
    closings: visibleDeals.map(deal => buildClientClosing(deal, byClient.get(deal.clientId), snapshot.names.get(deal.id))),
  };
}
