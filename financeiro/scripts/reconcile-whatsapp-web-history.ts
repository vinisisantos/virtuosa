import "dotenv/config";

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Prisma } from "@prisma/client";

import { campaignFromPrefilledMetaLeadMessage } from "../src/lib/campaign-track-mapping.ts";
import { prisma } from "../src/lib/db.ts";
import { phoneLookupKey } from "../src/lib/phone.ts";
import { resolveDefaultPipelineForUnit } from "../src/lib/pipeline/default-pipeline.ts";
import {
  historyContactName,
  historyMessageBody,
  historyMessagePreview,
  historyMessageStatus,
  historyMessageType,
  parseWhatsAppWebHistorySnapshot,
  type WhatsAppWebHistoryRow,
  type WhatsAppWebHistorySnapshot,
} from "../src/lib/whatsapp/history-reconciliation.ts";

const REQUIRED_UNIT = "SCS";
const REQUIRED_PROVIDER = "evolution";
const AUDIT_SOURCE = "whatsapp_web_history_reconciliation";
const AUDIT_EVENT = "history_reconciliation_applied";
const APPLY_TRANSACTION_ATTEMPTS = 3;

type CliOptions = {
  inputPath: string | null;
  instanceId: string | null;
  expectedAccount: string | null;
  apply: boolean;
  confirmation: string | null;
  help: boolean;
};

type InstanceContext = {
  id: string;
  instanceId: string;
  name: string;
  provider: string;
  unit: string | null;
  phoneNumber: string | null;
  capturesLeads: boolean;
  assignmentMode: string;
  userId: string | null;
  defaultAssigneeId: string | null;
  user: { name: string | null } | null;
  defaultAssignee: { name: string | null } | null;
};

type LeadAssignee = {
  userId: string | null;
  userName: string | null;
};

type ConversationAssignee = {
  assignedTo: string;
  assignedToName: string;
} | null;

type CampaignMatch = {
  campaignName: string;
  campaignTrackId: string | null;
} | null;

type ChatBatch = {
  phone: string;
  rows: WhatsAppWebHistoryRow[];
  firstInbound: WhatsAppWebHistoryRow;
  latestInbound: WhatsAppWebHistoryRow;
  contactName: string;
  campaign: CampaignMatch;
  campaignAmbiguous: boolean;
};

type ChatPlan = {
  batch: ChatBatch;
  contactExists: boolean;
  conversationExists: boolean;
  clientExists: boolean;
  dealExists: boolean;
  activeDealCount: number;
  pendingMessageIds: Set<string>;
};

type ApplyChatResult = {
  contactsCreated: number;
  conversationsCreated: number;
  clientsCreated: number;
  dealsCreated: number;
  messagesInserted: number;
  messagesSkipped: number;
  summariesUpdated: number;
  jidsFilled: number;
};

type ReconciliationDatabase = Pick<
  Prisma.TransactionClient,
  | "whatsAppContact"
  | "whatsAppConversation"
  | "whatsAppMessage"
  | "client"
  | "salesPipeline"
  | "pipeline"
  | "webhookLog"
>;

function printHelp() {
  console.log(`Reconcilia um snapshot local do WhatsApp Web com o CRM sem enviar mensagens.

Uso:
  npm run whatsapp:reconcile-history -- --input <snapshot.json> --instance-id <uuid> [--account <telefone>]
  npm run whatsapp:reconcile-history -- --input <snapshot.json> --instance-id <uuid> [--account <telefone>] --apply --confirm <token>

Opções:
  --input <arquivo>       Snapshot JSON extraído do WhatsApp Web.
  --instance-id <uuid>    ID interno exato da instância WhatsApp de SCS.
  --account <telefone>     Conta confirmada no WhatsApp Web; obrigatória se ausente no CRM.
  --apply                 Aplica o plano. Sem esta opção, sempre executa dry-run.
  --confirm <token>       Token exato impresso pelo dry-run para o mesmo arquivo.
  --help                  Exibe esta ajuda.

O executor nunca chama webhook, Evolution, IA, automações ou rotinas de callback.`);
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    inputPath: null,
    instanceId: null,
    expectedAccount: null,
    apply: false,
    confirmation: null,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") {
      options.help = true;
    } else if (argument === "--apply") {
      options.apply = true;
    } else if (argument === "--input") {
      options.inputPath = argv[++index] || null;
    } else if (argument === "--instance-id") {
      options.instanceId = argv[++index] || null;
    } else if (argument === "--account") {
      options.expectedAccount = argv[++index] || null;
    } else if (argument === "--confirm") {
      options.confirmation = argv[++index] || null;
    } else {
      throw new Error(`Argumento desconhecido: ${argument}`);
    }
  }

  if (options.help) return options;
  if (!options.inputPath) throw new Error("Informe --input <snapshot.json>.");
  if (!options.instanceId) throw new Error("Informe --instance-id <uuid>.");
  if (!options.apply && options.confirmation) {
    throw new Error("--confirm só pode ser usado junto com --apply.");
  }

  return options;
}

function sha256(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

function confirmationToken(params: {
  instanceId: string;
  windowFrom: string;
  windowToExclusive: string;
  snapshotSha256: string;
}) {
  const digest = sha256([
    params.instanceId,
    params.windowFrom,
    params.windowToExclusive,
    params.snapshotSha256,
  ].join("\u0000"));
  return `CONFIRMAR-RECONCILIACAO-SCS-${digest}`;
}

function maskPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  return digits ? `***${digits.slice(-4)}` : "***";
}

function phoneFromJid(phoneJid: string) {
  return phoneJid.split("@")[0].replace(/\D/g, "");
}

function rowOrderIndex(row: WhatsAppWebHistoryRow) {
  return row.chatOrderIndex ?? Number.MAX_SAFE_INTEGER;
}

/** Ordem antiga -> nova. No mesmo segundo, índice menor é mais recente. */
function compareRowsChronologically(first: WhatsAppWebHistoryRow, second: WhatsAppWebHistoryRow) {
  if (first.timestamp !== second.timestamp) return first.timestamp - second.timestamp;
  const orderDifference = rowOrderIndex(second) - rowOrderIndex(first);
  return orderDifference || first.messageId.localeCompare(second.messageId);
}

function dateForRow(row: WhatsAppWebHistoryRow) {
  return new Date(row.timestamp * 1_000);
}

function isStrictlyNewer(candidate: Date, current?: Date | null) {
  return !current || candidate.getTime() > current.getTime();
}

function nonPhoneContactName(rows: WhatsAppWebHistoryRow[], phone: string) {
  for (const row of [...rows].sort(compareRowsChronologically).reverse()) {
    const name = historyContactName(row, phone);
    if (phoneLookupKey(name) !== phoneLookupKey(phone)) return name;
  }
  return phone;
}

function campaignForRows(rows: WhatsAppWebHistoryRow[]) {
  const matches = new Map<string, Exclude<CampaignMatch, null>>();
  for (const row of rows) {
    if (row.fromMe) continue;
    const match = campaignFromPrefilledMetaLeadMessage(historyMessageBody(row), REQUIRED_UNIT);
    if (!match) continue;
    matches.set(`${match.campaignName}\u0000${match.campaignTrackId || ""}`, match);
  }

  return {
    campaign: matches.size === 1 ? [...matches.values()][0] : null,
    ambiguous: matches.size > 1,
  };
}

function buildChatBatches(snapshot: WhatsAppWebHistorySnapshot): ChatBatch[] {
  const groups = new Map<string, Map<string, WhatsAppWebHistoryRow>>();

  for (const row of snapshot.rows) {
    const phone = phoneFromJid(row.phoneJid);
    const rowsById = groups.get(phone) || new Map<string, WhatsAppWebHistoryRow>();
    const existing = rowsById.get(row.messageId);
    if (!existing || (row.type === "revoked" && existing.type !== "revoked")) {
      rowsById.set(row.messageId, row);
    }
    groups.set(phone, rowsById);
  }

  return [...groups.entries()].map(([phone, rowsById]) => {
    const rows = [...rowsById.values()].sort(compareRowsChronologically);
    const inboundRows = rows.filter((row) => !row.fromMe);
    if (inboundRows.length === 0) {
      throw new Error(`O chat ${maskPhone(phone)} não possui mensagem recebida na janela.`);
    }
    const campaignResult = campaignForRows(rows);
    return {
      phone,
      rows,
      firstInbound: inboundRows[0],
      latestInbound: inboundRows[inboundRows.length - 1],
      contactName: nonPhoneContactName(rows, phone),
      campaign: campaignResult.campaign,
      campaignAmbiguous: campaignResult.ambiguous,
    };
  }).sort((first, second) => compareRowsChronologically(first.firstInbound, second.firstInbound));
}

function contactPhoneConditions(phone: string) {
  const phoneKey = phoneLookupKey(phone);
  const suffix = phoneKey?.slice(-8) || phone.slice(-8);
  return [
    { phone },
    ...(suffix.length >= 8 ? [{ phone: { contains: suffix } }] : []),
  ];
}

async function findContact(database: ReconciliationDatabase, phone: string) {
  const exact = await database.whatsAppContact.findUnique({ where: { phone } });
  if (exact) return exact;

  const phoneKey = phoneLookupKey(phone);
  const candidates = await database.whatsAppContact.findMany({
    where: { OR: contactPhoneConditions(phone) },
    orderBy: { updatedAt: "desc" },
    take: 30,
  });
  const matches = candidates.filter((candidate) => phoneLookupKey(candidate.phone) === phoneKey);
  if (matches.length > 1) {
    throw new Error(`Contato ambíguo para ${maskPhone(phone)}: ${matches.length} registros equivalentes.`);
  }
  return matches[0] || null;
}

async function findClient(database: ReconciliationDatabase, phone: string) {
  const phoneKey = phoneLookupKey(phone);
  const suffix = phoneKey?.slice(-8) || phone.slice(-8);
  const candidates = await database.client.findMany({
    where: {
      isActive: true,
      phone: { contains: suffix },
      unit: REQUIRED_UNIT,
    },
    select: {
      id: true,
      name: true,
      phone: true,
      unit: true,
      originUnit: true,
      userId: true,
      campaignId: true,
      campaignName: true,
      campaignAttribution: true,
      updatedAt: true,
    },
    orderBy: { updatedAt: "desc" },
    take: 30,
  });
  const matches = candidates.filter((candidate) => phoneLookupKey(candidate.phone) === phoneKey);
  if (matches.length > 1) {
    throw new Error(`Cliente ambíguo para ${maskPhone(phone)}: ${matches.length} registros equivalentes em SCS.`);
  }
  return matches[0] || null;
}

function leadAssigneeForInstance(instance: InstanceContext): LeadAssignee {
  if (instance.assignmentMode === "TEAM_QUEUE") return { userId: null, userName: null };
  if (instance.assignmentMode === "DEFAULT_ASSIGNEE" && instance.defaultAssigneeId) {
    return {
      userId: instance.defaultAssigneeId,
      userName: instance.defaultAssignee?.name || null,
    };
  }
  return { userId: instance.userId, userName: instance.user?.name || null };
}

function conversationAssigneeForInstance(instance: InstanceContext): ConversationAssignee {
  if (instance.assignmentMode === "DEFAULT_ASSIGNEE" && instance.defaultAssigneeId) {
    return {
      assignedTo: instance.defaultAssigneeId,
      assignedToName: instance.defaultAssignee?.name || "Responsável da instância",
    };
  }
  return null;
}

async function loadExactInstance(instanceId: string): Promise<InstanceContext> {
  const instance = await prisma.whatsAppInstance.findUnique({
    where: { id: instanceId },
    select: {
      id: true,
      instanceId: true,
      name: true,
      provider: true,
      unit: true,
      phoneNumber: true,
      capturesLeads: true,
      assignmentMode: true,
      userId: true,
      defaultAssigneeId: true,
      user: { select: { name: true } },
      defaultAssignee: { select: { name: true } },
    },
  });
  if (!instance) throw new Error("Instância informada não existe.");
  if (instance.unit !== REQUIRED_UNIT) throw new Error("A instância não pertence exclusivamente a SCS.");
  if (instance.provider.trim().toLowerCase() !== REQUIRED_PROVIDER) {
    throw new Error("A instância não usa o provedor Evolution.");
  }
  if (instance.capturesLeads !== true) throw new Error("A captura de leads da instância está desativada.");
  return instance;
}

async function loadPipeline() {
  const pipeline = await resolveDefaultPipelineForUnit(prisma, REQUIRED_UNIT);
  if (!pipeline || !pipeline.stages[0]) {
    throw new Error("Não foi encontrado pipeline padrão com ao menos uma etapa.");
  }
  return { id: pipeline.id, stageId: pipeline.stages[0].id };
}

async function buildPlan(batches: ChatBatch[], instanceId: string): Promise<ChatPlan[]> {
  const plan: ChatPlan[] = [];
  for (const batch of batches) {
    const contact = await findContact(prisma, batch.phone);
    const conversation = contact
      ? await prisma.whatsAppConversation.findUnique({
          where: { contactId_instanceId: { contactId: contact.id, instanceId } },
        })
      : null;
    const existingMessages = conversation
      ? await prisma.whatsAppMessage.findMany({
          where: {
            conversationId: conversation.id,
            messageId: { in: batch.rows.map((row) => row.messageId) },
          },
          select: { messageId: true },
        })
      : [];
    const existingMessageIds = new Set(existingMessages.map((message) => message.messageId));
    const client = await findClient(prisma, batch.phone);
    const activeDealCount = client
      ? await prisma.salesPipeline.count({
          where: {
            clientId: client.id,
            unit: REQUIRED_UNIT,
            lostReason: null,
            closedAt: null,
          },
        })
      : 0;

    plan.push({
      batch,
      contactExists: Boolean(contact),
      conversationExists: Boolean(conversation),
      clientExists: Boolean(client),
      dealExists: activeDealCount > 0,
      activeDealCount,
      pendingMessageIds: new Set(
        batch.rows.filter((row) => !existingMessageIds.has(row.messageId)).map((row) => row.messageId),
      ),
    });
  }
  return plan;
}

function printDryRun(params: {
  inputPath: string;
  instance: InstanceContext;
  snapshot: WhatsAppWebHistorySnapshot;
  snapshotSha256: string;
  runId: string;
  token: string;
  plan: ChatPlan[];
  accountRequired: boolean;
}) {
  const messagesPending = params.plan.reduce((sum, item) => sum + item.pendingMessageIds.size, 0);
  const messagesExisting = params.snapshot.rows.length - messagesPending;
  const summary = {
    mode: "DRY_RUN",
    source: params.snapshot.source,
    runId: params.runId,
    instanceId: params.instance.id,
    instanceAccount: maskPhone(params.snapshot.account),
    unit: params.instance.unit,
    windowFrom: params.snapshot.windowFrom,
    windowToExclusive: params.snapshot.windowToExclusive,
    extractedAt: params.snapshot.extractedAt,
    snapshotSha256: params.snapshotSha256,
    totals: {
      chats: params.plan.length,
      messages: params.snapshot.rows.length,
      messagesPending,
      messagesExisting,
      inbound: params.snapshot.rows.filter((row) => !row.fromMe).length,
      outbound: params.snapshot.rows.filter((row) => row.fromMe).length,
      contactsToCreate: params.plan.filter((item) => !item.contactExists).length,
      conversationsToCreate: params.plan.filter((item) => !item.conversationExists).length,
      clientsToCreate: params.plan.filter((item) => !item.clientExists).length,
      dealsToCreate: params.plan.filter((item) => !item.dealExists).length,
      chatsWithDuplicateActiveDeals: params.plan.filter((item) => item.activeDealCount > 1).length,
      ambiguousCampaignsIgnored: params.plan.filter((item) => item.batch.campaignAmbiguous).length,
    },
    chats: params.plan.map((item) => ({
      phone: maskPhone(item.batch.phone),
      messages: item.batch.rows.length,
      pending: item.pendingMessageIds.size,
      inbound: item.batch.rows.filter((row) => !row.fromMe).length,
      outbound: item.batch.rows.filter((row) => row.fromMe).length,
      contact: item.contactExists ? "preservar" : "criar",
      conversation: item.conversationExists ? "preservar" : "criar",
      client: item.clientExists ? "preservar" : "criar",
      deal: item.dealExists ? "preservar" : "criar",
      campaign: item.batch.campaign ? "classificação inequívoca" : "sem classificação",
    })),
  };

  console.log(JSON.stringify(summary, null, 2));
  console.log("\nNenhuma escrita foi realizada.");
  console.log("Token de confirmação exato:");
  console.log(params.token);
  console.log("\nPara aplicar este mesmo arquivo:");
  const accountArgument = params.accountRequired
    ? " --account <conta-confirmada-no-whatsapp-web>"
    : "";
  console.log(
    `npm run whatsapp:reconcile-history -- --input ${JSON.stringify(params.inputPath)} --instance-id ${params.instance.id}${accountArgument} --apply --confirm ${params.token}`,
  );
}

function mediaSize(row: WhatsAppWebHistoryRow) {
  if (row.size === null) return null;
  return Math.max(0, Math.min(2_147_483_647, Math.round(row.size)));
}

function reconciliationMetadata(params: {
  source: string;
  runId: string;
  instanceId: string;
  windowFrom: string;
  windowToExclusive: string;
  snapshotSha256: string;
}): Prisma.InputJsonObject {
  return {
    source: params.source,
    runId: params.runId,
    instanceId: params.instanceId,
    windowFrom: params.windowFrom,
    windowToExclusive: params.windowToExclusive,
    snapshotSha256: params.snapshotSha256,
  };
}

async function applyChat(params: {
  database: ReconciliationDatabase;
  batch: ChatBatch;
  instance: InstanceContext;
  leadAssignee: LeadAssignee;
  conversationAssignee: ConversationAssignee;
  pipeline: { id: string; stageId: string };
  metadata: Prisma.InputJsonObject;
  runId: string;
}): Promise<ApplyChatResult> {
    const firstInboundAt = dateForRow(params.batch.firstInbound);
    let contact = await findContact(params.database, params.batch.phone);
    let contactsCreated = 0;
    if (!contact) {
      contact = await params.database.whatsAppContact.create({
        data: {
          phone: params.batch.phone,
          name: params.batch.contactName,
          unit: REQUIRED_UNIT,
          createdAt: firstInboundAt,
        },
      });
      contactsCreated = 1;
    }

    let conversation = await params.database.whatsAppConversation.findUnique({
      where: {
        contactId_instanceId: {
          contactId: contact.id,
          instanceId: params.instance.id,
        },
      },
    });
    let conversationsCreated = 0;
    if (!conversation) {
      conversation = await params.database.whatsAppConversation.create({
        data: {
          contactId: contact.id,
          instanceId: params.instance.id,
          status: "waiting_response",
          lastKnownJid: params.batch.latestInbound.chatJid,
          ...(params.conversationAssignee || {}),
          createdAt: firstInboundAt,
        },
      });
      conversationsCreated = 1;
    }

    const existingMessages = await params.database.whatsAppMessage.findMany({
      where: {
        conversationId: conversation.id,
        messageId: { in: params.batch.rows.map((row) => row.messageId) },
      },
      select: { messageId: true, dispatchMetadata: true },
    });
    const existingMessageIds = new Set(existingMessages.map((message) => message.messageId));
    const pendingRows = params.batch.rows.filter((row) => !existingMessageIds.has(row.messageId));

    const insertion = pendingRows.length
      ? await params.database.whatsAppMessage.createMany({
          data: pendingRows.map((row) => ({
            conversationId: conversation!.id,
            messageId: row.messageId,
            body: historyMessageBody(row),
            type: historyMessageType(row.type),
            mediaFileName: row.fileName,
            mediaMimeType: row.mimetype,
            mediaSizeBytes: mediaSize(row),
            fromMe: row.fromMe,
            status: historyMessageStatus(row),
            timestamp: dateForRow(row),
            createdAt: dateForRow(row),
            respondedByName: row.type === "automated_greeting_message"
              ? "Automação do WhatsApp"
              : null,
            dispatchMetadata: params.metadata,
          })),
          skipDuplicates: true,
        })
      : { count: 0 };

    if (insertion.count !== pendingRows.length) {
      throw new Error(
        `Concorrência detectada em ${maskPhone(params.batch.phone)}: ` +
        `${pendingRows.length} pendentes, ${insertion.count} inseridas. A transação foi revertida.`,
      );
    }

    const conversationUpdate: Prisma.WhatsAppConversationUpdateInput = {};
    let jidsFilled = 0;
    let summariesUpdated = 0;
    const latestInserted = pendingRows[pendingRows.length - 1];
    if (latestInserted && isStrictlyNewer(dateForRow(latestInserted), conversation.lastMessageAt)) {
      conversationUpdate.lastMessage = historyMessagePreview(latestInserted);
      conversationUpdate.lastMessageAt = dateForRow(latestInserted);
      const rowsNewerThanCurrentSummary = pendingRows.filter((row) =>
        isStrictlyNewer(dateForRow(row), conversation!.lastMessageAt),
      );
      conversationUpdate.unreadCount = conversation.unreadCount +
        rowsNewerThanCurrentSummary.filter((row) => !row.fromMe).length;
      summariesUpdated = 1;
    }

    const latestInbound = params.batch.latestInbound;
    const latestInboundAt = dateForRow(latestInbound);
    const latestInboundWasInsertedNow = pendingRows.some(
      (row) => row.messageId === latestInbound.messageId,
    );
    const latestInboundWasInsertedByRun = existingMessages.some((message) => {
      if (message.messageId !== latestInbound.messageId) return false;
      const value = message.dispatchMetadata;
      return !!value && typeof value === "object" && !Array.isArray(value) &&
        (value as Prisma.JsonObject).runId === params.runId;
    });
    const currentInboundAtMs = conversation.lastInboundAt?.getTime() ?? null;
    const latestInboundAtMs = latestInboundAt.getTime();
    const importedInboundIsNewer = currentInboundAtMs === null || latestInboundAtMs > currentInboundAtMs;
    const importedInboundOwnsSameTimestamp = currentInboundAtMs === latestInboundAtMs &&
      (latestInboundWasInsertedNow || latestInboundWasInsertedByRun);

    if (importedInboundIsNewer) {
      conversationUpdate.lastInboundAt = latestInboundAt;
    }
    if (
      (importedInboundIsNewer || importedInboundOwnsSameTimestamp) &&
      conversation.lastKnownJid !== latestInbound.chatJid
    ) {
      conversationUpdate.lastKnownJid = latestInbound.chatJid;
      jidsFilled = 1;
    }

    const latestPendingInbound = [...pendingRows].filter((row) => !row.fromMe).pop();
    const closedReferenceAt =
      conversation.closedAt || conversation.lastMessageAt || conversation.updatedAt;
    if (
      latestPendingInbound &&
      (conversation.status === "resolved" || conversation.status === "closed") &&
      dateForRow(latestPendingInbound) > closedReferenceAt
    ) {
      conversationUpdate.status = "open";
      conversationUpdate.reopenedAt = dateForRow(latestPendingInbound);
      conversationUpdate.reopenCount = { increment: 1 };
    }

    if (
      latestInserted &&
      conversation.archivedAt &&
      dateForRow(latestInserted) > conversation.archivedAt
    ) {
      conversationUpdate.archivedAt = null;
      conversationUpdate.archivedBy = null;
      conversationUpdate.archivedByName = null;
    }
    const latestOutbound = [...pendingRows].filter((row) => row.fromMe).pop();
    if (latestOutbound && isStrictlyNewer(dateForRow(latestOutbound), conversation.lastOutboundAt)) {
      conversationUpdate.lastOutboundAt = dateForRow(latestOutbound);
    }

    if (Object.keys(conversationUpdate).length > 0) {
      await params.database.whatsAppConversation.update({
        where: { id: conversation.id },
        data: conversationUpdate,
      });
    }

    let client = await findClient(params.database, params.batch.phone);
    let clientsCreated = 0;
    if (!client) {
      const resolvedName = phoneLookupKey(params.batch.contactName) === phoneLookupKey(params.batch.phone)
        ? `Lead WhatsApp ${params.batch.phone}`
        : params.batch.contactName;
      client = await params.database.client.create({
        data: {
          name: resolvedName,
          phone: params.batch.phone,
          unit: REQUIRED_UNIT,
          originUnit: REQUIRED_UNIT,
          stage: "entrada",
          source: params.batch.campaign ? "facebook_ad" : "whatsapp",
          arrivedAt: firstInboundAt,
          userId: params.leadAssignee.userId,
          campaignName: params.batch.campaign?.campaignName,
          campaignId: params.batch.campaign?.campaignTrackId || undefined,
          campaignAttribution: params.batch.campaign ? "automatic_meta" : undefined,
          createdAt: firstInboundAt,
        },
        select: {
          id: true,
          name: true,
          phone: true,
          unit: true,
          originUnit: true,
          userId: true,
          campaignId: true,
          campaignName: true,
          campaignAttribution: true,
          updatedAt: true,
        },
      });
      clientsCreated = 1;
    }

    const existingDeal = await params.database.salesPipeline.findFirst({
      where: {
        clientId: client.id,
        unit: REQUIRED_UNIT,
        lostReason: null,
        closedAt: null,
      },
      select: { id: true },
      orderBy: { updatedAt: "desc" },
    });
    let dealsCreated = 0;
    if (!existingDeal) {
      await params.database.salesPipeline.create({
        data: {
          clientId: client.id,
          clientName: client.name,
          stage: "novo_lead",
          pipelineId: params.pipeline.id,
          stageId: params.pipeline.stageId,
          source: "whatsapp",
          unit: REQUIRED_UNIT,
          notes: "Lead recuperado do histórico do WhatsApp Web",
          assignedTo: params.leadAssignee.userId,
          assignedName: params.leadAssignee.userName,
          campaignIdSnapshot: client.campaignId,
          campaignNameSnapshot: client.campaignName,
          campaignAttributionSnapshot: client.campaignAttribution,
          createdAt: firstInboundAt,
        },
      });
      dealsCreated = 1;
    }

    return {
      contactsCreated,
      conversationsCreated,
      clientsCreated,
      dealsCreated,
      messagesInserted: insertion.count,
      messagesSkipped: params.batch.rows.length - insertion.count,
      summariesUpdated,
      jidsFilled,
    };
}

function sumResults(results: ApplyChatResult[]): ApplyChatResult {
  return results.reduce<ApplyChatResult>((total, result) => ({
    contactsCreated: total.contactsCreated + result.contactsCreated,
    conversationsCreated: total.conversationsCreated + result.conversationsCreated,
    clientsCreated: total.clientsCreated + result.clientsCreated,
    dealsCreated: total.dealsCreated + result.dealsCreated,
    messagesInserted: total.messagesInserted + result.messagesInserted,
    messagesSkipped: total.messagesSkipped + result.messagesSkipped,
    summariesUpdated: total.summariesUpdated + result.summariesUpdated,
    jidsFilled: total.jidsFilled + result.jidsFilled,
  }), {
    contactsCreated: 0,
    conversationsCreated: 0,
    clientsCreated: 0,
    dealsCreated: 0,
    messagesInserted: 0,
    messagesSkipped: 0,
    summariesUpdated: 0,
    jidsFilled: 0,
  });
}

function isRetryableApplyError(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return error.code === "P2002" || error.code === "P2034";
  }
  return error instanceof Error && error.message.startsWith("Concorrência detectada em ");
}

async function applyChatAtomically(params: Omit<Parameters<typeof applyChat>[0], "database">) {
  for (let attempt = 1; attempt <= APPLY_TRANSACTION_ATTEMPTS; attempt += 1) {
    try {
      return await prisma.$transaction(
        (tx) => applyChat({ ...params, database: tx }),
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 10_000,
          timeout: 30_000,
        },
      );
    } catch (error) {
      if (attempt === APPLY_TRANSACTION_ATTEMPTS || !isRetryableApplyError(error)) throw error;
    }
  }

  throw new Error("Não foi possível concluir a reconciliação atômica do chat.");
}

async function recordAuditOnce(params: {
  database: ReconciliationDatabase;
  runId: string;
  snapshot: WhatsAppWebHistorySnapshot;
  snapshotSha256: string;
  result: ApplyChatResult;
  chats: number;
}) {
  const previous = await params.database.webhookLog.findFirst({
    where: {
      source: AUDIT_SOURCE,
      eventType: AUDIT_EVENT,
      payload: { contains: `\"runId\":\"${params.runId}\"` },
    },
    select: { id: true },
  });
  if (previous) return;

  await params.database.webhookLog.create({
    data: {
      source: AUDIT_SOURCE,
      eventType: AUDIT_EVENT,
      status: "processed",
      processedAt: new Date(),
      payload: JSON.stringify({
        runId: params.runId,
        snapshotSha256: params.snapshotSha256,
        rows: params.snapshot.rows.length,
        chats: params.chats,
        ...params.result,
      }),
    },
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const inputPath = resolve(options.inputPath!);
  const file = await readFile(inputPath);
  const snapshotSha256 = sha256(file);
  let rawSnapshot: unknown;
  try {
    rawSnapshot = JSON.parse(file.toString("utf8"));
  } catch {
    throw new Error("O arquivo informado não contém JSON válido.");
  }

  const instance = await loadExactInstance(options.instanceId!);
  const expectedAccount = instance.phoneNumber || options.expectedAccount;
  if (!expectedAccount) {
    throw new Error(
      "A instância não possui número cadastrado; informe --account com a conta confirmada no WhatsApp Web.",
    );
  }
  const snapshot = parseWhatsAppWebHistorySnapshot(rawSnapshot, {
    instanceId: instance.id,
    account: expectedAccount,
  });
  if (snapshot.rows.length === 0) throw new Error("O snapshot está vazio.");
  if (new Date(snapshot.extractedAt).getTime() < new Date(snapshot.windowToExclusive).getTime()) {
    throw new Error("O snapshot foi extraído antes do fim de sua própria janela.");
  }

  const batches = buildChatBatches(snapshot);
  const pipeline = await loadPipeline();
  const token = confirmationToken({
    instanceId: instance.id,
    windowFrom: snapshot.windowFrom,
    windowToExclusive: snapshot.windowToExclusive,
    snapshotSha256,
  });
  const runId = `wa-history-${sha256(token).slice(0, 20)}`;
  const plan = await buildPlan(batches, instance.id);
  if (plan.some((item) => item.activeDealCount > 1)) {
    throw new Error("Há mais de um negócio ativo para ao menos um cliente do snapshot.");
  }

  if (!options.apply) {
    printDryRun({
      inputPath,
      instance,
      snapshot,
      snapshotSha256,
      runId,
      token,
      plan,
      accountRequired: !instance.phoneNumber,
    });
    return;
  }

  if (options.confirmation !== token) {
    throw new Error("Confirmação inválida. Rode o dry-run novamente e copie o token exato impresso por ele.");
  }

  const metadata = reconciliationMetadata({
    source: snapshot.source,
    runId,
    instanceId: snapshot.instanceId,
    windowFrom: snapshot.windowFrom,
    windowToExclusive: snapshot.windowToExclusive,
    snapshotSha256,
  });
  const leadAssignee = leadAssigneeForInstance(instance);
  const conversationAssignee = conversationAssigneeForInstance(instance);
  const results: ApplyChatResult[] = [];
  for (const batch of batches) {
    results.push(await applyChatAtomically({
      batch,
      instance,
      leadAssignee,
      conversationAssignee,
      pipeline,
      metadata,
      runId,
    }));
  }
  const result = sumResults(results);
  const verification = await buildPlan(batches, instance.id);
  const incomplete = verification.filter((item) =>
    !item.contactExists ||
    !item.conversationExists ||
    !item.clientExists ||
    item.activeDealCount !== 1 ||
    item.pendingMessageIds.size > 0,
  );
  if (incomplete.length > 0) {
    throw new Error(
      `Verificação pós-aplicação falhou para ${incomplete.length} chat(s); rode novamente o dry-run.`,
    );
  }
  await prisma.$transaction(async (tx) => {
    await recordAuditOnce({
      database: tx,
      runId,
      snapshot,
      snapshotSha256,
      result,
      chats: batches.length,
    });
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    maxWait: 10_000,
    timeout: 30_000,
  });

  console.log(JSON.stringify({
    mode: "APPLY",
    success: true,
    runId,
    instanceId: instance.id,
    account: maskPhone(snapshot.account),
    unit: instance.unit,
    windowFrom: snapshot.windowFrom,
    windowToExclusive: snapshot.windowToExclusive,
    snapshotSha256,
    chats: batches.length,
    ...result,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(`[reconcile-whatsapp-web-history] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
