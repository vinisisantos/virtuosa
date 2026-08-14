import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getInstancesForRequest } from "@/lib/whatsapp/instance-resolver";

import { campaignUrlFromClient, pickBestCampaignClient } from "@/lib/campaign-client-selection";
import { campaignAccountOriginFromTrackId } from "@/lib/campaign-account-origin";
import { prisma } from "@/lib/db";
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

  if (status === "unread") {
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
    followUps?: Array<{ status?: string | null; scheduledAt?: Date | string | null }>;
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
  if (requestedStatus === "unread") {
    return Boolean(
      (conversation.unreadCount || 0) > 0
      && !["closed", WHATSAPP_CALLBACK_LOST_STATUS].includes(conversationStatus || ""),
    );
  }
  if (requestedStatus === "closed") {
    return ["resolved", "closed"].includes(conversationStatus || "");
  }
  if (requestedStatus === "callback") {
    const dueAt = conversation.callbackDueAt ? new Date(conversation.callbackDueAt).getTime() : Number.POSITIVE_INFINITY;
    return Boolean(
      conversation.callbackTrackingStartedAt
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

function fullSearchStatusSql(status: string, showArchived: boolean, requesterUserId: string) {
  if ((status === "all" || !status) && showArchived) return EMPTY_SQL;
  if (status === "all" || !status) {
    return Prisma.sql`AND conversation."status" NOT IN ('closed', ${WHATSAPP_CALLBACK_LOST_STATUS})`;
  }
  if (status === "open") {
    return Prisma.sql`AND conversation."status" IN ('open', 'waiting_customer', 'waiting_response')`;
  }
  if (status === "unread") {
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
      Prisma.sql`LOWER(COALESCE(contact."name", '')) LIKE LOWER(${pattern}) ESCAPE ${"\\"}`,
      Prisma.sql`LOWER(COALESCE(conversation."assignedToName", '')) LIKE LOWER(${pattern}) ESCAPE ${"\\"}`,
      Prisma.sql`EXISTS (
        SELECT 1
        FROM "WhatsAppMessage" message
        WHERE message."conversationId" = conversation."id"
          AND LOWER(COALESCE(message."body", '')) LIKE LOWER(${pattern}) ESCAPE ${"\\"}
      )`,
      Prisma.sql`EXISTS (
        SELECT 1
        FROM "WhatsAppConversationInternalNote" internal_note
        WHERE internal_note."conversationId" = conversation."id"
          AND LOWER(COALESCE(internal_note."content", '')) LIKE LOWER(${pattern}) ESCAPE ${"\\"}
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
            LOWER(COALESCE(client."campaignName", '')) LIKE LOWER(${pattern}) ESCAPE ${"\\"}
            OR EXISTS (
              SELECT 1
              FROM "SalesPipeline" pipeline
              WHERE pipeline."clientId" = client."id"
                AND (instance."unit" IS NULL OR instance."unit" = 'Todas' OR pipeline."unit" = instance."unit")
                AND LOWER(COALESCE(pipeline."notes", '')) LIKE LOWER(${pattern}) ESCAPE ${"\\"}
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

export async function GET(req: Request) {
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
        queueCounts: { open: 0, unread: 0, callback: 0, followup: 0, lost: 0 },
      });
    }

    const instanceIds = dbInstances.map(i => i.id);
    const requesterUserId = req.headers.get("x-user-id") || "";
    const statusFilter = showArchived && status === "all" ? {} : getStatusFilter(status);
    const followUpOwnerFilter = assignedFollowUpFilter(status, requesterUserId);
    const archiveFilter = getArchiveFilter(showArchived);

    if (summary === "unread") {
      const [conversations, followUps] = await Promise.all([
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
      ]);

      return NextResponse.json({ conversations, followUps, count: conversations.length, serverTime });
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
      resolution: true,
      closedAt: true,
      closedByName: true,
      satisfactionScore: true,
      lastInboundAt: true,
      lastOutboundAt: true,
      callbackDueAt: true,
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
      && !cursor
      && !conversations.some((c) => c.id === requestedConversationId)
    ) {
      const requestedConversation = await prisma.whatsAppConversation.findFirst({
        where: {
          id: requestedConversationId,
          instanceId: { in: instanceIds },
          ...archiveFilter,
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

    const clients = phoneSuffixes.length
      ? await prisma.client.findMany({
          where: {
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
      const k = normalizePhoneSuffix(cl.phone);
      if (k.length < 8) continue;
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
    const conversationsWithTags = visibleConversations.map((c) => {
      const { followUps, ...conversation } = c;
      const campaign = campaignByPhone.get(normalizePhoneSuffix(c.contact?.phone));
      return {
        ...conversation,
        activeFollowUp: followUps[0] || null,
        ...(includeCampaigns ? {
          campaignName: campaign?.name || null,
          campaignUrl: campaign?.url || null,
          campaignAccountOrigin: campaign?.accountOrigin || null,
        } : {}),
      };
    }).sort((a, b) => {
      if (status !== "followup") return 0;
      return new Date(a.activeFollowUp?.scheduledAt || 0).getTime()
        - new Date(b.activeFollowUp?.scheduledAt || 0).getTime();
    });

    const [queueCountRow] = await prisma.$queryRaw<Array<{
      openCount: bigint;
      unreadCount: bigint;
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
        COUNT(*) FILTER (
          WHERE "callbackTrackingStartedAt" IS NOT NULL
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
      WHERE "instanceId" IN (${Prisma.join(instanceIds)})
        AND "archivedAt" IS NULL
    `);
    const openCount = Number(queueCountRow?.openCount || 0);
    const unreadCount = Number(queueCountRow?.unreadCount || 0);
    const callbackCount = Number(queueCountRow?.callbackCount || 0);
    const followupCount = Number(queueCountRow?.followupCount || 0);
    const lostCount = Number(queueCountRow?.lostCount || 0);

    return NextResponse.json({
      conversations: conversationsWithTags,
      incremental: isIncremental,
      hasMore,
      limit,
      nextCursor,
      removedConversationIds,
      serverTime,
      searchTooShort,
      queueCounts: { open: openCount, unread: unreadCount, callback: callbackCount, followup: followupCount, lost: lostCount },
    });
  } catch (error: any) {
    console.error("[WhatsApp Conversations API Error]:", error);
    return NextResponse.json({ error: "Erro interno", details: error.message }, { status: 500 });
  }
}
