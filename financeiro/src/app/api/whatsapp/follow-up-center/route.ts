import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { pickBestCampaignClient } from "@/lib/campaign-client-selection";
import { prisma } from "@/lib/db";
import { permittedUnitsForAccess } from "@/lib/role-access";
import {
  WHATSAPP_CALLBACK_LOST_STATUS,
  WHATSAPP_CALLBACK_MAX_TEAM_ATTEMPTS,
} from "@/lib/whatsapp/callbacks";
import { WHATSAPP_CALLBACK_SUPPRESSED_CLOSED_PACKAGE } from "@/lib/whatsapp/callback-suppression";
import {
  FOLLOW_UP_CENTER_PAGE_SIZE,
  FOLLOW_UP_CENTER_PILOT_UNIT,
  parseFollowUpCenterBucket,
} from "@/lib/whatsapp/follow-up-center";
import { getInstancesForRequest } from "@/lib/whatsapp/instance-resolver";

const MAX_PAGE_SIZE = 100;
const CAMPAIGN_PHONE_LOOKUP_TAKE = 8;

function normalizePhoneSuffix(value?: string | null) {
  return (value || "").replace(/\D/g, "").slice(-8);
}

function readPermissions(req: Request) {
  try {
    return JSON.parse(req.headers.get("x-user-permissions") || "{}") as Record<string, boolean>;
  } catch {
    return {};
  }
}

function parseNonNegativeInteger(value: string | null, fallback: number) {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function scopedPilotRequest(req: Request) {
  const url = new URL(req.url);
  url.searchParams.set("unit", FOLLOW_UP_CENTER_PILOT_UNIT);
  return new Request(url, { headers: req.headers, method: "GET" });
}

function pilotConversationWhere(instanceIds: string[], now: Date): Prisma.WhatsAppConversationWhereInput {
  return {
    instanceId: { in: instanceIds },
    archivedAt: null,
    callbackTrackingStartedAt: { not: null },
    lastOutboundAt: { not: null },
    callbackDueAt: { lte: now },
    callbackStreakCount: { lt: WHATSAPP_CALLBACK_MAX_TEAM_ATTEMPTS },
    callbackQueueStatus: { not: WHATSAPP_CALLBACK_SUPPRESSED_CLOSED_PACKAGE },
    status: { notIn: ["closed", "resolved", WHATSAPP_CALLBACK_LOST_STATUS] },
    OR: [
      { instance: { unit: FOLLOW_UP_CENTER_PILOT_UNIT } },
      {
        instance: { unit: "Todas" },
        contact: { unit: FOLLOW_UP_CENTER_PILOT_UNIT },
      },
    ],
  };
}

function bucketConversationWhere(params: {
  bucket: ReturnType<typeof parseFollowUpCenterBucket>;
  instanceIds: string[];
  now: Date;
}): Prisma.WhatsAppConversationWhereInput {
  const dayMs = 24 * 60 * 60 * 1000;
  const base = pilotConversationWhere(params.instanceIds, params.now);
  const sevenDaysAgo = new Date(params.now.getTime() - 7 * dayMs);
  const fourteenDaysAgo = new Date(params.now.getTime() - 14 * dayMs);

  if (params.bucket === "priority") {
    return { ...base, callbackDueAt: { gt: sevenDaysAgo, lte: params.now } };
  }
  if (params.bucket === "recovery") {
    return { ...base, callbackDueAt: { gt: fourteenDaysAgo, lte: sevenDaysAgo } };
  }
  if (params.bucket === "reactivation") {
    return { ...base, callbackDueAt: { lte: fourteenDaysAgo } };
  }
  if (params.bucket === "first_attempt") {
    return { ...base, callbackStreakCount: 0 };
  }
  return base;
}

type FollowUpCenterStatsRow = {
  totalDue: bigint;
  firstAttempt: bigint;
  dueToday: bigint;
  dueOneToSevenDays: bigint;
  dueSevenToFourteenDays: bigint;
  dueOverFourteenDays: bigint;
  manualFollowUpsDue: bigint;
};

function toNumber(value: bigint | number | null | undefined) {
  return Number(value || 0);
}

export async function GET(req: Request) {
  try {
    const userId = req.headers.get("x-user-id");
    if (!userId) {
      return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
    }

    const role = req.headers.get("x-user-role") || "";
    const userUnit = req.headers.get("x-user-unit") || "";
    const permissions = readPermissions(req);
    const permittedUnits = permittedUnitsForAccess({ role, userUnit, permissions });
    if (!permittedUnits.includes(FOLLOW_UP_CENTER_PILOT_UNIT)) {
      return NextResponse.json(
        { error: `O piloto está disponível apenas para ${FOLLOW_UP_CENTER_PILOT_UNIT}.` },
        { status: 403 },
      );
    }

    const { searchParams } = new URL(req.url);
    const bucket = parseFollowUpCenterBucket(searchParams.get("bucket"));
    const offset = parseNonNegativeInteger(searchParams.get("offset"), 0);
    const requestedLimit = parseNonNegativeInteger(
      searchParams.get("limit"),
      FOLLOW_UP_CENTER_PAGE_SIZE,
    );
    const limit = Math.min(Math.max(1, requestedLimit), MAX_PAGE_SIZE);
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    const { instances } = await getInstancesForRequest(scopedPilotRequest(req));
    const instanceIds = instances.map((instance) => instance.id);
    if (instanceIds.length === 0) {
      return NextResponse.json({
        unit: FOLLOW_UP_CENTER_PILOT_UNIT,
        bucket,
        scope: { instanceCount: 0, label: "Nenhuma conta disponível" },
        stats: {
          totalDue: 0,
          firstAttempt: 0,
          dueToday: 0,
          dueOneToSevenDays: 0,
          dueSevenToFourteenDays: 0,
          dueOverFourteenDays: 0,
          manualFollowUpsDue: 0,
        },
        conversations: [],
        hasMore: false,
        serverTime: now.toISOString(),
      });
    }

    const [statsRow] = await prisma.$queryRaw<FollowUpCenterStatsRow[]>(Prisma.sql`
      WITH callback_scope AS (
        SELECT conversation.*
        FROM "WhatsAppConversation" conversation
        INNER JOIN "WhatsAppInstance" instance ON instance.id = conversation."instanceId"
        INNER JOIN "WhatsAppContact" contact ON contact.id = conversation."contactId"
        WHERE conversation."instanceId" IN (${Prisma.join(instanceIds)})
          AND conversation."archivedAt" IS NULL
          AND conversation."callbackTrackingStartedAt" IS NOT NULL
          AND conversation."lastOutboundAt" IS NOT NULL
          AND (
            conversation."lastInboundAt" IS NULL
            OR conversation."lastOutboundAt" > conversation."lastInboundAt"
          )
          AND conversation."callbackDueAt" <= ${now}
          AND conversation."callbackStreakCount" < ${WHATSAPP_CALLBACK_MAX_TEAM_ATTEMPTS}
          AND conversation."callbackQueueStatus" <> ${WHATSAPP_CALLBACK_SUPPRESSED_CLOSED_PACKAGE}
          AND conversation.status NOT IN ('closed', 'resolved', ${WHATSAPP_CALLBACK_LOST_STATUS})
          AND (
            instance.unit = ${FOLLOW_UP_CENTER_PILOT_UNIT}
            OR (instance.unit = 'Todas' AND contact.unit = ${FOLLOW_UP_CENTER_PILOT_UNIT})
          )
      ),
      manual_follow_up_scope AS (
        SELECT follow_up.id
        FROM "WhatsAppConversationFollowUp" follow_up
        INNER JOIN "WhatsAppConversation" conversation ON conversation.id = follow_up."conversationId"
        INNER JOIN "WhatsAppInstance" instance ON instance.id = conversation."instanceId"
        INNER JOIN "WhatsAppContact" contact ON contact.id = conversation."contactId"
        WHERE conversation."instanceId" IN (${Prisma.join(instanceIds)})
          AND conversation."archivedAt" IS NULL
          AND conversation.status NOT IN ('closed', 'resolved', ${WHATSAPP_CALLBACK_LOST_STATUS})
          AND follow_up.status = 'scheduled'
          AND follow_up."scheduledAt" <= ${now}
          AND (
            instance.unit = ${FOLLOW_UP_CENTER_PILOT_UNIT}
            OR (instance.unit = 'Todas' AND contact.unit = ${FOLLOW_UP_CENTER_PILOT_UNIT})
          )
      )
      SELECT
        COUNT(*)::bigint AS "totalDue",
        COUNT(*) FILTER (WHERE "callbackStreakCount" = 0)::bigint AS "firstAttempt",
        COUNT(*) FILTER (WHERE "callbackDueAt" > ${oneDayAgo})::bigint AS "dueToday",
        COUNT(*) FILTER (
          WHERE "callbackDueAt" <= ${oneDayAgo} AND "callbackDueAt" > ${sevenDaysAgo}
        )::bigint AS "dueOneToSevenDays",
        COUNT(*) FILTER (
          WHERE "callbackDueAt" <= ${sevenDaysAgo} AND "callbackDueAt" > ${fourteenDaysAgo}
        )::bigint AS "dueSevenToFourteenDays",
        COUNT(*) FILTER (WHERE "callbackDueAt" <= ${fourteenDaysAgo})::bigint AS "dueOverFourteenDays",
        (SELECT COUNT(*)::bigint FROM manual_follow_up_scope) AS "manualFollowUpsDue"
      FROM callback_scope
    `);

    const rows = await prisma.whatsAppConversation.findMany({
      where: bucketConversationWhere({ bucket, instanceIds, now }),
      select: {
        id: true,
        instanceId: true,
        assignedTo: true,
        assignedToName: true,
        lastMessage: true,
        lastMessageAt: true,
        lastInboundAt: true,
        lastOutboundAt: true,
        callbackDueAt: true,
        callbackStreakCount: true,
        callbackTotalCount: true,
        contact: {
          select: {
            name: true,
            phone: true,
            profilePic: true,
            unit: true,
          },
        },
        instance: {
          select: {
            name: true,
            unit: true,
          },
        },
      },
      orderBy: [
        { callbackStreakCount: "asc" },
        { callbackDueAt: "desc" },
        { id: "desc" },
      ],
      skip: offset,
      take: limit + 1,
    });

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const phoneSuffixes = [...new Set(
      pageRows
        .map((conversation) => normalizePhoneSuffix(conversation.contact.phone))
        .filter((suffix) => suffix.length >= 8),
    )];
    const clients = phoneSuffixes.length > 0
      ? await prisma.client.findMany({
          where: {
            OR: phoneSuffixes.map((suffix) => ({ phone: { contains: suffix } })),
          },
          select: {
            phone: true,
            campaignName: true,
            campaignId: true,
            fbclid: true,
            source: true,
            updatedAt: true,
          },
          orderBy: { updatedAt: "desc" },
          take: Math.max(limit, phoneSuffixes.length * CAMPAIGN_PHONE_LOOKUP_TAKE),
        })
      : [];
    const campaignCandidatesByPhone = new Map<string, typeof clients>();
    for (const client of clients) {
      const phoneKey = normalizePhoneSuffix(client.phone);
      if (phoneKey.length < 8) continue;
      const candidates = campaignCandidatesByPhone.get(phoneKey) || [];
      candidates.push(client);
      campaignCandidatesByPhone.set(phoneKey, candidates);
    }
    const campaignByPhone = new Map<string, string>();
    for (const [phoneKey, candidates] of campaignCandidatesByPhone.entries()) {
      const campaignName = pickBestCampaignClient(candidates)?.campaignName?.trim();
      if (campaignName) campaignByPhone.set(phoneKey, campaignName);
    }
    const accessByInstanceId = new Map(instances.map((instance) => [instance.id, instance]));
    const instanceLabels = [...new Set(instances.map((instance) => instance.displayName || instance.name))];

    return NextResponse.json({
      unit: FOLLOW_UP_CENTER_PILOT_UNIT,
      bucket,
      scope: {
        instanceCount: instances.length,
        label: instanceLabels.length === 1
          ? instanceLabels[0]
          : `${instances.length} contas acessíveis`,
      },
      stats: {
        totalDue: toNumber(statsRow?.totalDue),
        firstAttempt: toNumber(statsRow?.firstAttempt),
        dueToday: toNumber(statsRow?.dueToday),
        dueOneToSevenDays: toNumber(statsRow?.dueOneToSevenDays),
        dueSevenToFourteenDays: toNumber(statsRow?.dueSevenToFourteenDays),
        dueOverFourteenDays: toNumber(statsRow?.dueOverFourteenDays),
        manualFollowUpsDue: toNumber(statsRow?.manualFollowUpsDue),
      },
      conversations: pageRows.map((conversation) => ({
        ...conversation,
        campaignName: campaignByPhone.get(normalizePhoneSuffix(conversation.contact.phone)) || null,
        canReply: accessByInstanceId.get(conversation.instanceId)?.canReply !== false,
      })),
      hasMore,
      nextOffset: hasMore ? offset + limit : null,
      serverTime: now.toISOString(),
    });
  } catch (error) {
    console.error("[Follow-up Center]", error);
    return NextResponse.json(
      { error: "Não foi possível carregar a Central de Follow-up." },
      { status: 500 },
    );
  }
}
