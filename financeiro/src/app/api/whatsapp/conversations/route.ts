import { NextResponse, type NextRequest } from "next/server";
import { getUserFromHeaders } from "@/lib/auth";
import { permittedUnitsForAccess } from "@/lib/role-access";
import { Prisma } from "@prisma/client";
import { getInstancesForRequest } from "@/lib/whatsapp/instance-resolver";
import { getInstancePresentationSettings } from "@/lib/whatsapp/instance-presentation";
import { matchesBrazilianDddBucket, type BrazilianDddBucket } from "@/lib/whatsapp/phone-ddd";

import { campaignUrlFromClient, pickBestCampaignClient } from "@/lib/campaign-client-selection";
import { campaignClientKey } from "@/lib/whatsapp/lead-client-selection";
import { resolveInboxConversationUnit } from "@/lib/whatsapp/conversation-unit";
import { dispatchSnapshot, dispatchUnitEnabled } from "@/lib/whatsapp/dispatch";
import { latestDispatchesQuery } from "@/lib/whatsapp/dispatch-query";
import {
  campaignAccountOriginFromInstance,
  campaignAccountOriginFromTrackId,
} from "@/lib/campaign-account-origin";
import { prisma } from "@/lib/db";
import { inboxAppointmentsQuery, inboxAppointmentSnapshot } from "@/lib/whatsapp/inbox-appointments-query";
import {
  WHATSAPP_CALLBACK_LOST_STATUS,
  WHATSAPP_CALLBACK_MAX_TEAM_ATTEMPTS,
} from "@/lib/whatsapp/callbacks";
import {
  parseInboxSearchQuery,
  type InboxSearchQuery,
} from "@/lib/whatsapp/inbox-search";

let whatsappPerformanceIndexesReady = false;
let whatsappPerformanceIndexesPromise: Promise<void> | null = null;

const DEFAULT_CONVERSATION_LIMIT = 120;
const MAX_CONVERSATION_LIMIT = 200;
const CAMPAIGN_PHONE_LOOKUP_TAKE = 8;

function parseLimit(value: string | null) {
  const parsed = Number.parseInt(value || "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_CONVERSATION_LIMIT;
  return Math.min(parsed, MAX_CONVERSATION_LIMIT);
}

function parseUpdatedSince(value: string | null) {
  if (!value) return null;

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;

  // Pequena sobreposicao para evitar perder atualizacoes no mesmo milissegundo do cursor.
  return new Date(parsed.getTime() - 2000);
}

function getStatusFilter(status: string) {
  if (status === "all" || !status) {
    return { status: { notIn: ["closed", WHATSAPP_CALLBACK_LOST_STATUS] } };
  }

  if (status === "open") {
    return { status: { in: ["open", "waiting_customer", "waiting_response"] } };
  }

  if (["unread", "unreadDdd11", "unreadOtherDdd"].includes(status)) {
    return {
      unreadCount: { gt: 0 },
      status: { notIn: ["closed", WHATSAPP_CALLBACK_LOST_STATUS] },
    };
  }

  if (status === "closed") {
    return { status: { in: ["resolved", "closed"] } };
  }

  if (status === "callback") {
    return {
      callbackTrackingStartedAt: { not: null },
      commercialPaused: false,
      callbackDueAt: { lte: new Date() },
      callbackStreakCount: { lt: WHATSAPP_CALLBACK_MAX_TEAM_ATTEMPTS },
      status: { notIn: ["closed", "resolved", WHATSAPP_CALLBACK_LOST_STATUS] },
    };
  }

  if (status === "followup") {
    return {
      followUps: {
        some: {
          status: "scheduled",
          scheduledAt: { lte: new Date() },
        },
      },
      status: { notIn: ["closed", "resolved", WHATSAPP_CALLBACK_LOST_STATUS] },
    };
  }

  if (status === WHATSAPP_CALLBACK_LOST_STATUS) {
    return { status: WHATSAPP_CALLBACK_LOST_STATUS };
  }

  return { status };
}

function assignedFollowUpFilter(status: string, requesterUserId: string) {
  if (status !== "followup" || !requesterUserId) return {};
  return {
    followUps: {
      some: {
        status: "scheduled",
        scheduledAt: { lte: new Date() },
        assignedTo: requesterUserId,
      },
    },
  };
}

function getArchiveFilter(showArchived: boolean) {
  return showArchived
    ? { archivedAt: { not: null } }
    : { archivedAt: null };
}

function isConversationVisibleForRequest(
  conversation: {
    status?: string | null;
    unreadCount?: number | null;
    archivedAt?: Date | string | null;
    callbackTrackingStartedAt?: Date | string | null;
    callbackDueAt?: Date | string | null;
    callbackStreakCount?: number | null;
    commercialPaused?: boolean;
    followUps?: Array<{ status?: string | null; scheduledAt?: Date | string | null }>;
    contact?: { phone?: string | null } | null;
  },
  requestedStatus: string,
  showArchived: boolean,
) {
  if (showArchived !== Boolean(conversation.archivedAt)) return false;

  const conversationStatus = conversation.status;
  if (requestedStatus === "all" || !requestedStatus) {
    return showArchived || conversationStatus !== "closed";
  }
  if (requestedStatus === "open") {
    return ["open", "waiting_customer", "waiting_response"].includes(conversationStatus || "");
  }
  if (["unread", "unreadDdd11", "unreadOtherDdd"].includes(requestedStatus)) {
    return Boolean(
      (conversation.unreadCount || 0) > 0
      && !["closed", WHATSAPP_CALLBACK_LOST_STATUS].includes(conversationStatus || "")
      && (requestedStatus === "unread"
        || matchesBrazilianDddBucket(
          conversation.contact?.phone,
          requestedStatus === "unreadDdd11" ? "ddd11" : "other",
        )),
    );
  }
  if (requestedStatus === "closed") {
    return ["resolved", "closed"].includes(conversationStatus || "");
  }
  if (requestedStatus === "callback") {
    const dueAt = conversation.callbackDueAt ? new Date(conversation.callbackDueAt).getTime() : Number.POSITIVE_INFINITY;
    return Boolean(
      conversation.callbackTrackingStartedAt
      && !conversation.commercialPaused
      && dueAt <= Date.now()
      && (conversation.callbackStreakCount || 0) < WHATSAPP_CALLBACK_MAX_TEAM_ATTEMPTS
      && !["closed", "resolved", WHATSAPP_CALLBACK_LOST_STATUS].includes(conversationStatus || ""),
    );
  }
  if (requestedStatus === "followup") {
    return Boolean(
      conversation.followUps?.some((followUp) => (
        followUp.status === "scheduled"
        && new Date(followUp.scheduledAt || "").getTime() <= Date.now()
      ))
      && !["closed", "resolved", WHATSAPP_CALLBACK_LOST_STATUS].includes(conversationStatus || ""),
    );
  }

  return conversationStatus === requestedStatus;
}

function normalizePhoneSuffix(value?: string | null) {
  return (value || "").replace(/\D/g, "").slice(-8);
}

const EMPTY_SQL = Prisma.sql``;

function brazilianDdd11Sql() {
  const digits = Prisma.sql`regexp_replace(contact."phone", '[^0-9]', '', 'g')`;
  const nationalNumber = Prisma.sql`
    CASE
      WHEN ${digits} LIKE '55%' AND LENGTH(${digits}) IN (12, 13)
        THEN SUBSTRING(${digits} FROM 3)
      ELSE ${digits}
    END
  `;
  return Prisma.sql`(
    ${nationalNumber} ~ '^[0-9]{10,11}$'
    AND SUBSTRING(${nationalNumber} FROM 1 FOR 2) = '11'
  )`;
}

function brazilianDddBucketSql(bucket: BrazilianDddBucket) {
  const ddd11 = brazilianDdd11Sql();
  return bucket === "ddd11" ? ddd11 : Prisma.sql`NOT (${ddd11})`;
}

async function findUnreadDddConversationIds(params: {
  bucket: BrazilianDddBucket;
  instanceIds: string[];
  cursor: string | null;
  limit: number;
}) {
  const { bucket, instanceIds, cursor, limit } = params;
  const cursorJoinSql = cursor
    ? Prisma.sql`
        INNER JOIN "WhatsAppConversation" cursor_conversation
          ON cursor_conversation."id" = ${cursor}
          AND cursor_conversation."instanceId" IN (${Prisma.join(instanceIds)})
      `
    : EMPTY_SQL;
  const cursorSql = cursor
    ? Prisma.sql`
        AND (
          COALESCE(conversation."lastMessageAt", 'infinity'::timestamptz),
          conversation."id"
        ) < (
          COALESCE(cursor_conversation."lastMessageAt", 'infinity'::timestamptz),
          cursor_conversation."id"
        )
      `
    : EMPTY_SQL;
  const rows = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT conversation."id"
    FROM "WhatsAppConversation" conversation
    INNER JOIN "WhatsAppContact" contact ON contact."id" = conversation."contactId"
    ${cursorJoinSql}
    WHERE conversation."instanceId" IN (${Prisma.join(instanceIds)})
      AND conversation."archivedAt" IS NULL
      AND conversation."unreadCount" > 0
      AND conversation."status" NOT IN ('closed', ${WHATSAPP_CALLBACK_LOST_STATUS})
      AND ${brazilianDddBucketSql(bucket)}
      ${cursorSql}
    ORDER BY conversation."lastMessageAt" DESC, conversation."id" DESC
    LIMIT ${limit + 1}
  `);

  return rows.map((row) => row.id);
}

async function findUpdatedDddConversationIds(params: {
  bucket: BrazilianDddBucket;
  instanceIds: string[];
  updatedSince: Date;
  limit: number;
}) {
  const { bucket, instanceIds, updatedSince, limit } = params;
  const rows = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT conversation."id"
    FROM "WhatsAppConversation" conversation
    INNER JOIN "WhatsAppContact" contact ON contact."id" = conversation."contactId"
    WHERE conversation."instanceId" IN (${Prisma.join(instanceIds)})
      AND (
        conversation."updatedAt" >= ${updatedSince}
        OR conversation."lastMessageAt" >= ${updatedSince}
      )
      AND ${brazilianDddBucketSql(bucket)}
    ORDER BY conversation."updatedAt" DESC, conversation."id" DESC
    LIMIT ${limit}
  `);

  return rows.map((row) => row.id);
}

function fullSearchStatusSql(status: string, showArchived: boolean, requesterUserId: string) {
  if ((status === "all" || !status) && showArchived) return EMPTY_SQL;
  if (status === "all" || !status) {
    return Prisma.sql`AND conversation."status" NOT IN ('closed', ${WHATSAPP_CALLBACK_LOST_STATUS})`;
  }
  if (status === "open") {
    return Prisma.sql`AND conversation."status" IN ('open', 'waiting_customer', 'waiting_response')`;
  }
  if (["unread", "unreadDdd11", "unreadOtherDdd"].includes(status)) {
    return Prisma.sql`
      AND conversation."unreadCount" > 0
      AND conversation."status" NOT IN ('closed', ${WHATSAPP_CALLBACK_LOST_STATUS})
    `;
  }
  if (status === "closed") {
    return Prisma.sql`AND conversation."status" IN ('resolved', 'closed')`;
  }
  if (status === "callback") {
    return Prisma.sql`
      AND conversation."callbackTrackingStartedAt" IS NOT NULL
      AND conversation."commercialPaused" = false
      AND conversation."callbackDueAt" <= NOW()
      AND conversation."callbackStreakCount" < ${WHATSAPP_CALLBACK_MAX_TEAM_ATTEMPTS}
      AND conversation."status" NOT IN ('closed', 'resolved', ${WHATSAPP_CALLBACK_LOST_STATUS})
    `;
  }
  if (status === "followup") {
    return Prisma.sql`
      AND EXISTS (
        SELECT 1
        FROM "WhatsAppConversationFollowUp" follow_up
        WHERE follow_up."conversationId" = conversation."id"
          AND follow_up."status" = 'scheduled'
          AND follow_up."scheduledAt" <= NOW()
          AND follow_up."assignedTo" = ${requesterUserId}
      )
      AND conversation."status" NOT IN ('closed', 'resolved', ${WHATSAPP_CALLBACK_LOST_STATUS})
    `;
  }
  return Prisma.sql`AND conversation."status" = ${status}`;
}

function fullSearchMatchSql(search: InboxSearchQuery) {
  const textPredicates: Prisma.Sql[] = [];
  if (search.textPattern) {
    const pattern = search.textPattern;
    textPredicates.push(
      Prisma.sql`public.virtuosa_search_normalize(COALESCE(contact."name", '')) LIKE ${pattern} ESCAPE ${"\\"}`,
      Prisma.sql`public.virtuosa_search_normalize(COALESCE(conversation."assignedToName", '')) LIKE ${pattern} ESCAPE ${"\\"}`,
      Prisma.sql`EXISTS (
        SELECT 1
        FROM "WhatsAppMessage" message
        WHERE message."conversationId" = conversation."id"
          AND public.virtuosa_search_normalize(COALESCE(message."body", '')) LIKE ${pattern} ESCAPE ${"\\"}
      )`,
      Prisma.sql`EXISTS (
        SELECT 1
        FROM "WhatsAppConversationInternalNote" internal_note
        WHERE internal_note."conversationId" = conversation."id"
          AND public.virtuosa_search_normalize(COALESCE(internal_note."content", '')) LIKE ${pattern} ESCAPE ${"\\"}
      )`,
      Prisma.sql`EXISTS (
        SELECT 1
        FROM "Client" client
        WHERE LENGTH(REGEXP_REPLACE(COALESCE(contact."phone", ''), '[^0-9]', '', 'g')) >= 8
          AND RIGHT(REGEXP_REPLACE(COALESCE(client."phone", ''), '[^0-9]', '', 'g'), 8)
            = RIGHT(REGEXP_REPLACE(COALESCE(contact."phone", ''), '[^0-9]', '', 'g'), 8)
          AND (
            instance."unit" IS NULL
            OR instance."unit" = 'Todas'
            OR client."originUnit" = instance."unit"
            OR client."unit" = instance."unit"
          )
          AND (
            public.virtuosa_search_normalize(COALESCE(client."campaignName", '')) LIKE ${pattern} ESCAPE ${"\\"}
            OR EXISTS (
              SELECT 1
              FROM "SalesPipeline" pipeline
              WHERE pipeline."clientId" = client."id"
                AND (instance."unit" IS NULL OR instance."unit" = 'Todas' OR pipeline."unit" = instance."unit")
                AND public.virtuosa_search_normalize(COALESCE(pipeline."notes", '')) LIKE ${pattern} ESCAPE ${"\\"}
            )
          )
      )`,
    );
  }

  if (search.digitsPattern) {
    textPredicates.push(Prisma.sql`
      REGEXP_REPLACE(COALESCE(contact."phone", ''), '[^0-9]', '', 'g')
        LIKE ${search.digitsPattern} ESCAPE ${"\\"}
    `);
  }

  return Prisma.sql`AND (${Prisma.join(textPredicates, " OR ")})`;
}

async function findFullSearchConversationIds(params: {
  search: InboxSearchQuery;
  instanceIds: string[];
  dddBucket?: BrazilianDddBucket | null;
  status: string;
  showArchived: boolean;
  requesterUserId: string;
  updatedSince: Date | null;
  cursor: string | null;
  limit: number;
}) {
  const {
    search,
    instanceIds,
    dddBucket,
    status,
    showArchived,
    requesterUserId,
    updatedSince,
    cursor,
    limit,
  } = params;
  const archiveSql = showArchived
    ? Prisma.sql`AND conversation."archivedAt" IS NOT NULL`
    : Prisma.sql`AND conversation."archivedAt" IS NULL`;
  const updatedSinceSql = updatedSince
    ? Prisma.sql`
        AND (
          conversation."updatedAt" >= ${updatedSince}
          OR conversation."lastMessageAt" >= ${updatedSince}
        )
      `
    : EMPTY_SQL;
  const dddBucketSql = dddBucket
    ? Prisma.sql`AND ${brazilianDddBucketSql(dddBucket)}`
    : EMPTY_SQL;
  const cursorJoinSql = cursor
    ? Prisma.sql`
        INNER JOIN "WhatsAppConversation" cursor_conversation
          ON cursor_conversation."id" = ${cursor}
          AND cursor_conversation."instanceId" IN (${Prisma.join(instanceIds)})
      `
    : EMPTY_SQL;
  const cursorSql = !cursor
    ? EMPTY_SQL
    : status === "callback"
      ? Prisma.sql`
          AND (conversation."callbackDueAt", conversation."id")
            < (cursor_conversation."callbackDueAt", cursor_conversation."id")
        `
      : Prisma.sql`
          AND (
            COALESCE(conversation."lastMessageAt", 'infinity'::timestamptz),
            conversation."id"
          ) < (
            COALESCE(cursor_conversation."lastMessageAt", 'infinity'::timestamptz),
            cursor_conversation."id"
          )
        `;
  const orderSql = updatedSince
    ? Prisma.sql`conversation."updatedAt" DESC, conversation."id" DESC`
    : status === "callback"
      ? Prisma.sql`conversation."callbackDueAt" DESC, conversation."id" DESC`
      : Prisma.sql`conversation."lastMessageAt" DESC, conversation."id" DESC`;

  const rows = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT conversation."id"
    FROM "WhatsAppConversation" conversation
    INNER JOIN "WhatsAppContact" contact ON contact."id" = conversation."contactId"
    INNER JOIN "WhatsAppInstance" instance ON instance."id" = conversation."instanceId"
    ${cursorJoinSql}
    WHERE conversation."instanceId" IN (${Prisma.join(instanceIds)})
      ${archiveSql}
      ${fullSearchStatusSql(status, showArchived, requesterUserId)}
      ${dddBucketSql}
      ${updatedSinceSql}
      ${cursorSql}
      ${fullSearchMatchSql(search)}
    ORDER BY ${orderSql}
    LIMIT ${updatedSince ? limit : limit + 1}
  `);

  return rows.map((row) => row.id);
}

function ensureWhatsappPerformanceIndexes() {
  if (process.env.WHATSAPP_AUTO_ENSURE_INDEXES !== "1") return Promise.resolve();
  if (whatsappPerformanceIndexesReady) return Promise.resolve();

  if (!whatsappPerformanceIndexesPromise) {
    whatsappPerformanceIndexesPromise = Promise.all([
      prisma.$executeRawUnsafe(
        `CREATE INDEX IF NOT EXISTS "WhatsAppConversation_instanceId_status_lastMessageAt_idx" ON "WhatsAppConversation"("instanceId", "status", "lastMessageAt" DESC)`
      ),
      prisma.$executeRawUnsafe(
        `CREATE INDEX IF NOT EXISTS "WhatsAppConversation_instanceId_lastMessageAt_idx" ON "WhatsAppConversation"("instanceId", "lastMessageAt" DESC)`
      ),
      prisma.$executeRawUnsafe(
        `CREATE INDEX IF NOT EXISTS "WhatsAppConversation_unreadCount_idx" ON "WhatsAppConversation"("unreadCount")`
      ),
      prisma.$executeRawUnsafe(
        `CREATE INDEX IF NOT EXISTS "WhatsAppMessage_conversationId_timestamp_idx" ON "WhatsAppMessage"("conversationId", "timestamp")`
      ),
    ])
      .then(() => {
        whatsappPerformanceIndexesReady = true;
      })
      .catch((error) => {
        whatsappPerformanceIndexesPromise = null;
        console.error("[WhatsApp Performance Indexes]:", error);
      });
  }

  return whatsappPerformanceIndexesPromise;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") || "all";
    const summary = searchParams.get("summary");
    const requestedConversationId = searchParams.get("conversationId");
    const limit = parseLimit(searchParams.get("limit"));
    const updatedSince = parseUpdatedSince(searchParams.get("updatedSince"));
    const cursor = updatedSince ? null : searchParams.get("cursor");
    const search = (searchParams.get("search") || "").trim();
    const includeCampaigns = searchParams.get("includeCampaigns") !== "0";
    const showArchived = searchParams.get("archived") === "1";
    const fullSearch = parseInboxSearchQuery(search);
    const searchTooShort = Boolean(search) && !fullSearch;
    const serverTime = new Date().toISOString();
    const isIncremental = Boolean(updatedSince);

    await ensureWhatsappPerformanceIndexes();

    // Resolver instâncias do usuário
    const { instances: dbInstances } = await getInstancesForRequest(req);

    if (!dbInstances || dbInstances.length === 0) {
      return NextResponse.json({
        conversations: [],
        hasMore: false,
        nextCursor: null,
        serverTime,
        searchTooShort,
        appointmentSnapshot: {},
        queueCounts: { open: 0, unread: 0, unreadDdd11: 0, unreadOtherDdd: 0, callback: 0, followup: 0, lost: 0 },
      });
    }

    const instanceIds = dbInstances.map(i => i.id);
    const requestsLeadsOsascoSplit = searchParams.get("dddSplit") === "leads-osasco";
    let dddSplitEnabled = false;
    if (requestsLeadsOsascoSplit && dbInstances.length === 1) {
      const instance = dbInstances[0];
      const presentation = await getInstancePresentationSettings();
      dddSplitEnabled = instance.unit === "Osasco"
        && presentation.displayNames[instance.id]?.trim().toLocaleLowerCase("pt-BR") === "leads osasco"
        && presentation.channels[instance.id] !== "instagram";
    }
    if (["unreadDdd11", "unreadOtherDdd"].includes(status) && !dddSplitEnabled) {
      return NextResponse.json({
        conversations: [],
        hasMore: false,
        nextCursor: null,
        serverTime,
        searchTooShort,
        appointmentSnapshot: {},
        queueCounts: { open: 0, unread: 0, unreadDdd11: 0, unreadOtherDdd: 0, callback: 0, followup: 0, lost: 0 },
      });
    }
    const dddBucket: BrazilianDddBucket | null = dddSplitEnabled && status === "unreadDdd11"
      ? "ddd11"
      : dddSplitEnabled && status === "unreadOtherDdd"
        ? "other"
        : null;
    const instanceUnitById = new Map(
      dbInstances.map((instance) => [instance.id, instance.unit || null]),
    );
    const requesterUserId = req.headers.get("x-user-id") || "";
    const statusFilter = showArchived && status === "all" ? {} : getStatusFilter(status);
    const followUpOwnerFilter = assignedFollowUpFilter(status, requesterUserId);
    const archiveFilter = getArchiveFilter(showArchived);

    if (summary === "unread") {
      const [conversations, followUps, notifications, notificationUnreadCount] = await Promise.all([
        prisma.whatsAppConversation.findMany({
          where: {
            instanceId: { in: instanceIds },
            unreadCount: { gt: 0 },
            ...statusFilter,
            ...archiveFilter,
          },
          select: {
            id: true,
            instanceId: true,
            unreadCount: true,
          },
        }),
        requesterUserId
          ? prisma.whatsAppConversationFollowUp.findMany({
              where: {
                assignedTo: requesterUserId,
                status: "scheduled",
                scheduledAt: { lte: new Date() },
                conversation: {
                  instanceId: { in: instanceIds },
                  archivedAt: null,
                  status: { notIn: ["closed", "resolved", WHATSAPP_CALLBACK_LOST_STATUS] },
                },
              },
              select: {
                id: true,
                scheduledAt: true,
                conversation: {
                  select: {
                    id: true,
                    instanceId: true,
                    contact: { select: { name: true, phone: true } },
                  },
                },
              },
              orderBy: { scheduledAt: "asc" },
              take: 100,
            })
          : Promise.resolve([]),
        requesterUserId
          ? prisma.notification.findMany({
              where: { userId: requesterUserId, isRead: false },
              select: {
                id: true,
                type: true,
                title: true,
                message: true,
                icon: true,
                link: true,
                isRead: true,
                createdAt: true,
              },
              orderBy: { createdAt: "desc" },
              take: 15,
            })
          : Promise.resolve([]),
        requesterUserId
          ? prisma.notification.count({
              where: { userId: requesterUserId, isRead: false },
            })
          : Promise.resolve(0),
      ]);

      return NextResponse.json({
        conversations,
        followUps,
        notifications,
        notificationUnreadCount,
        count: conversations.length,
        serverTime,
      });
    }

    const baseConversationWhere = updatedSince
      ? {
          instanceId: { in: instanceIds },
          OR: [
            { updatedAt: { gte: updatedSince } },
            { lastMessageAt: { gte: updatedSince } },
          ],
        }
      : {
          instanceId: { in: instanceIds },
          ...statusFilter,
          ...followUpOwnerFilter,
          ...archiveFilter,
        };
    const conversationSelect = {
      id: true,
      instanceId: true,
      status: true,
      assignedTo: true,
      assignedToName: true,
      unreadCount: true,
      lastMessage: true,
      lastMessageAt: true,
      updatedAt: true,
      internalNotesUpdatedAt: true,
      resolution: true,
      closedAt: true,
      closedByName: true,
      satisfactionScore: true,
      lastInboundAt: true,
      lastOutboundAt: true,
      callbackDueAt: true,
      commercialPaused: true,
      aiMode: true,
      aiModeUpdatedAt: true,
      aiModeUpdatedBy: true,
      callbackTrackingStartedAt: true,
      callbackStreakCount: true,
      callbackTotalCount: true,
      callbackPipelineSyncedAt: true,
      followUps: {
        where: { status: "scheduled" },
        select: {
          id: true,
          scheduledAt: true,
          note: true,
          status: true,
          assignedTo: true,
          assignedToName: true,
          createdBy: true,
          createdByName: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { scheduledAt: "asc" as const },
        take: 1,
      },
      archivedAt: true,
      archivedByName: true,
      blockedAt: true,
      blockedByName: true,
      contact: {
        select: {
          id: true,
          phone: true,
          name: true,
          profilePic: true,
          tags: true,
          unit: true,
        },
      },
    } as const;

    type ConversationResult = Prisma.WhatsAppConversationGetPayload<{
      select: typeof conversationSelect;
    }>;
    let conversations: ConversationResult[];
    let hasMore = false;

    if (searchTooShort) {
      conversations = [];
    } else if (fullSearch) {
      const matchedIds = await findFullSearchConversationIds({
        search: fullSearch,
        instanceIds,
        dddBucket,
        status,
        showArchived,
        requesterUserId,
        updatedSince,
        cursor,
        limit,
      });
      hasMore = !updatedSince && matchedIds.length > limit;
      const pageIds = hasMore ? matchedIds.slice(0, limit) : matchedIds;
      const hydratedConversations = pageIds.length
        ? await prisma.whatsAppConversation.findMany({
            where: { id: { in: pageIds } },
            select: conversationSelect,
          })
        : [];
      const conversationById = new Map(hydratedConversations.map((conversation) => [conversation.id, conversation]));
      conversations = pageIds.flatMap((id) => {
        const conversation = conversationById.get(id);
        return conversation ? [conversation] : [];
      });
    } else if (dddBucket && !updatedSince) {
      const matchedIds = await findUnreadDddConversationIds({
        bucket: dddBucket,
        instanceIds,
        cursor,
        limit,
      });
      hasMore = matchedIds.length > limit;
      const pageIds = hasMore ? matchedIds.slice(0, limit) : matchedIds;
      const hydratedConversations = pageIds.length
        ? await prisma.whatsAppConversation.findMany({
            where: { id: { in: pageIds }, instanceId: { in: instanceIds } },
            select: conversationSelect,
          })
        : [];
      const conversationById = new Map(hydratedConversations.map((conversation) => [conversation.id, conversation]));
      conversations = pageIds.flatMap((id) => {
        const conversation = conversationById.get(id);
        return conversation ? [conversation] : [];
      });
    } else if (dddBucket && updatedSince) {
      const updatedIds = await findUpdatedDddConversationIds({
        bucket: dddBucket,
        instanceIds,
        updatedSince,
        limit,
      });
      const hydratedConversations = updatedIds.length
        ? await prisma.whatsAppConversation.findMany({
            where: { id: { in: updatedIds }, instanceId: { in: instanceIds } },
            select: conversationSelect,
          })
        : [];
      const conversationById = new Map(hydratedConversations.map((conversation) => [conversation.id, conversation]));
      conversations = updatedIds.flatMap((id) => {
        const conversation = conversationById.get(id);
        return conversation ? [conversation] : [];
      });
    } else {
      conversations = await prisma.whatsAppConversation.findMany({
        where: baseConversationWhere,
        select: conversationSelect,
        orderBy: updatedSince
          ? { updatedAt: "desc" as const }
          : status === "callback"
            ? [
                { callbackDueAt: "desc" as const },
                { id: "desc" as const },
              ]
            : [
                { lastMessageAt: "desc" as const },
                { id: "desc" as const },
              ],
        take: updatedSince ? limit : limit + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      hasMore = !updatedSince && conversations.length > limit;
      if (hasMore) {
        conversations = conversations.slice(0, limit);
      }
    }
    const nextCursor = hasMore ? conversations.at(-1)?.id || null : null;

    if (
      requestedConversationId
      && !fullSearch
      && !searchTooShort
      && !updatedSince
      && !dddBucket
      && !cursor
      && !conversations.some((c) => c.id === requestedConversationId)
    ) {
      const requestedConversation = await prisma.whatsAppConversation.findFirst({
        where: {
          id: requestedConversationId,
          instanceId: { in: instanceIds },
        },
        select: conversationSelect,
      });
      if (requestedConversation) {
        conversations = [requestedConversation, ...conversations];
      }
    }

    const visibleConversations = updatedSince
      ? conversations.filter((conversation) => (
          isConversationVisibleForRequest(conversation, status, showArchived)
          && (status !== "followup" || conversation.followUps.some((followUp) => followUp.assignedTo === requesterUserId))
        ))
      : conversations;
    const removedConversationIds = updatedSince
      ? conversations
          .filter((conversation) => (
            !isConversationVisibleForRequest(conversation, status, showArchived)
            || (status === "followup" && !conversation.followUps.some((followUp) => followUp.assignedTo === requesterUserId))
          ))
          .map((conversation) => conversation.id)
      : [];

    // ── Tag = campanha de origem do lead ─────────────────────────────────────
    // A "etiqueta" de cada conversa é a campanha (Client.campaignName), casada
    // pelo telefone do contato. Consulta enxuta (só os telefones visíveis) e
    // já escopada — as conversas aqui são exclusivamente do dono da caixa.
    const phoneSuffixes = includeCampaigns
      ? [...new Set(
          visibleConversations
            .map((c) => normalizePhoneSuffix(c.contact?.phone))
            .filter((suffix) => suffix.length >= 8)
        )]
      : [];

    const campaignUnits = [...new Set(visibleConversations.map(c => resolveInboxConversationUnit(
      instanceUnitById.get(c.instanceId), searchParams.get("unit"), c.contact?.unit,
    )).filter(Boolean))];
    const clients = phoneSuffixes.length && campaignUnits.length
      ? await prisma.client.findMany({
          where: {
            unit: { in: campaignUnits },
            OR: phoneSuffixes.map((suffix) => ({ phone: { contains: suffix } })),
          },
          select: {
            phone: true,
            unit: true,
            originUnit: true,
            source: true,
            campaignName: true,
            campaignId: true,
            fbclid: true,
            updatedAt: true,
          },
          orderBy: { updatedAt: "desc" },
          take: Math.max(limit, phoneSuffixes.length * CAMPAIGN_PHONE_LOOKUP_TAKE),
        })
      : [];
    const campaignCandidatesByPhone = new Map<string, typeof clients>();
    for (const cl of clients) {
      const k = campaignClientKey(cl.phone, cl.unit);
      if (!k) continue;
      const list = campaignCandidatesByPhone.get(k) || [];
      list.push(cl);
      campaignCandidatesByPhone.set(k, list);
    }
    const campaignByPhone = new Map<string, {
      name: string | null;
      url: string | null;
      accountOrigin: ReturnType<typeof campaignAccountOriginFromTrackId>;
    }>();
    for (const [phoneKey, candidates] of campaignCandidatesByPhone.entries()) {
      const best = pickBestCampaignClient(candidates);
      const accountOrigin = campaignAccountOriginFromTrackId(
        best?.campaignId,
        best?.originUnit || best?.unit,
      );
      if (!best?.campaignName && !accountOrigin) continue;
      campaignByPhone.set(phoneKey, {
        name: best?.campaignName || null,
        url: campaignUrlFromClient(best),
        accountOrigin,
      });
    }
    const appointmentUser = getUserFromHeaders(req);
    const appointmentUnits = [...new Set([
      ...permittedUnitsForAccess({
        role: appointmentUser?.role,
        userUnit: appointmentUser?.unit,
        permissions: appointmentUser?.permissions,
      }),
      ...dbInstances.map((instance) => instance.unit).filter((unit): unit is string => !!unit && unit !== "Todas"),
    ])];
    const requestedAppointmentUnit = searchParams.get("unit");
    const appointmentRows = await prisma.$queryRaw<Array<{
      conversationId: string; id: string; unit: string; startTime: Date;
    }>>(inboxAppointmentsQuery(
      instanceIds,
      ["Todas", "all"].includes(requestedAppointmentUnit || "") ? null : requestedAppointmentUnit,
      appointmentUnits,
    ));
    const appointmentSnapshot = inboxAppointmentSnapshot(appointmentRows);
    const dispatchConversationIds = visibleConversations
      .filter(c => dispatchUnitEnabled(instanceUnitById.get(c.instanceId), c.contact?.unit))
      .map(c => c.id);
    const dispatchRows = dispatchConversationIds.length
      ? await prisma.$queryRaw<Array<Parameters<typeof dispatchSnapshot>[0]>>(latestDispatchesQuery(dispatchConversationIds))
      : [];
    const dispatchByConversation = new Map(dispatchRows.map(row => [row.conversationId, dispatchSnapshot(row)]));
    const conversationsWithTags = visibleConversations.map((c) => {
      const { followUps, ...conversation } = c;
      const campaign = campaignByPhone.get(campaignClientKey(c.contact?.phone, resolveInboxConversationUnit(
        instanceUnitById.get(c.instanceId), searchParams.get("unit"), c.contact?.unit,
      )));
      const instanceAccountOrigin = campaignAccountOriginFromInstance(
        c.instanceId,
        instanceUnitById.get(c.instanceId),
      );
      return {
        ...conversation,
        lastDispatch: dispatchByConversation.get(c.id) || null,
        scheduledEvaluation: appointmentSnapshot[c.id] || null,
        activeFollowUp: followUps[0] || null,
        ...(includeCampaigns ? {
          campaignName: campaign?.name || null,
          campaignUrl: campaign?.url || null,
          campaignAccountOrigin: campaign?.accountOrigin || instanceAccountOrigin || null,
        } : {}),
      };
    }).sort((a, b) => {
      if (status !== "followup") return 0;
      return new Date(a.activeFollowUp?.scheduledAt || 0).getTime()
        - new Date(b.activeFollowUp?.scheduledAt || 0).getTime();
    });

    const dddContactJoinSql = dddSplitEnabled
      ? Prisma.sql`INNER JOIN "WhatsAppContact" contact ON contact."id" = "WhatsAppConversation"."contactId"`
      : EMPTY_SQL;
    const dddQueueCountsSql = dddSplitEnabled
      ? Prisma.sql`
          COUNT(*) FILTER (
            WHERE "unreadCount" > 0
              AND "status" NOT IN ('closed', ${WHATSAPP_CALLBACK_LOST_STATUS})
              AND ${brazilianDddBucketSql("ddd11")}
          ) AS "unreadDdd11Count",
          COUNT(*) FILTER (
            WHERE "unreadCount" > 0
              AND "status" NOT IN ('closed', ${WHATSAPP_CALLBACK_LOST_STATUS})
              AND ${brazilianDddBucketSql("other")}
          ) AS "unreadOtherDddCount",
        `
      : Prisma.sql`0::bigint AS "unreadDdd11Count", 0::bigint AS "unreadOtherDddCount",`;
    const [queueCountRow] = await prisma.$queryRaw<Array<{
      openCount: bigint;
      unreadCount: bigint;
      unreadDdd11Count: bigint;
      unreadOtherDddCount: bigint;
      callbackCount: bigint;
      followupCount: bigint;
      lostCount: bigint;
    }>>(Prisma.sql`
      SELECT
        COUNT(*) FILTER (
          WHERE "status" IN ('open', 'waiting_customer', 'waiting_response')
        ) AS "openCount",
        COUNT(*) FILTER (
          WHERE "unreadCount" > 0
            AND "status" NOT IN ('closed', ${WHATSAPP_CALLBACK_LOST_STATUS})
        ) AS "unreadCount",
        ${dddQueueCountsSql}
        COUNT(*) FILTER (
          WHERE "callbackTrackingStartedAt" IS NOT NULL
            AND "commercialPaused" = false
            AND "callbackDueAt" <= NOW()
            AND "callbackStreakCount" < ${WHATSAPP_CALLBACK_MAX_TEAM_ATTEMPTS}
            AND "status" NOT IN ('closed', 'resolved', ${WHATSAPP_CALLBACK_LOST_STATUS})
        ) AS "callbackCount",
        COUNT(*) FILTER (
          WHERE EXISTS (
            SELECT 1
            FROM "WhatsAppConversationFollowUp" follow_up
            WHERE follow_up."conversationId" = "WhatsAppConversation"."id"
              AND follow_up."status" = 'scheduled'
              AND follow_up."scheduledAt" <= NOW()
              AND follow_up."assignedTo" = ${requesterUserId}
          )
            AND "status" NOT IN ('closed', 'resolved', ${WHATSAPP_CALLBACK_LOST_STATUS})
        ) AS "followupCount",
        COUNT(*) FILTER (WHERE "status" = ${WHATSAPP_CALLBACK_LOST_STATUS}) AS "lostCount"
      FROM "WhatsAppConversation"
      ${dddContactJoinSql}
      WHERE "instanceId" IN (${Prisma.join(instanceIds)})
        AND "archivedAt" IS NULL
    `);
    const openCount = Number(queueCountRow?.openCount || 0);
    const unreadCount = Number(queueCountRow?.unreadCount || 0);
    const unreadDdd11Count = Number(queueCountRow?.unreadDdd11Count || 0);
    const unreadOtherDddCount = Number(queueCountRow?.unreadOtherDddCount || 0);
    const callbackCount = Number(queueCountRow?.callbackCount || 0);
    const followupCount = Number(queueCountRow?.followupCount || 0);
    const lostCount = Number(queueCountRow?.lostCount || 0);

    return NextResponse.json({
      conversations: conversationsWithTags,
      appointmentSnapshot,
      incremental: isIncremental,
      hasMore,
      limit,
      nextCursor,
      removedConversationIds,
      serverTime,
      searchTooShort,
      queueCounts: {
        open: openCount,
        unread: unreadCount,
        unreadDdd11: unreadDdd11Count,
        unreadOtherDdd: unreadOtherDddCount,
        callback: callbackCount,
        followup: followupCount,
        lost: lostCount,
      },
    });
  } catch (error: any) {
    console.error("[WhatsApp Conversations API Error]:", error);
    return NextResponse.json({ error: "Erro interno", details: error.message }, { status: 500 });
  }
}
