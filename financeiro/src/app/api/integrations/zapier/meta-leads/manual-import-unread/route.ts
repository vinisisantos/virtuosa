import { createHash, timingSafeEqual } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { phoneLookupKey } from "@/lib/phone";

export const runtime = "nodejs";

const JOBS = [
  {
    unit: "SCS",
    instanceId: "bbb24b4e-ef6d-4b64-93e8-9998d0514c65",
    prefix: "manual-scs-sheet-gluteos-2026-08-04-",
  },
  {
    unit: "SBC",
    instanceId: "a6871ee7-8352-4b66-bfb2-b8dba9e4f8e3",
    prefix: "manual-sbc-sheet-gluteos-2026-08-04-",
  },
  {
    unit: "Osasco",
    instanceId: "d1385a2c-e4e9-4822-8125-c693edf9ef3d",
    prefix: "manual-osasco-sheet-gluteos-2026-08-04-",
  },
  {
    unit: "Osasco",
    instanceId: "d1385a2c-e4e9-4822-8125-c693edf9ef3d",
    prefix: "manual-osasco-sheet-gluteos-followup-2026-08-04-",
  },
  {
    unit: "SCS",
    instanceId: "bbb24b4e-ef6d-4b64-93e8-9998d0514c65",
    prefix: "manual-scs-sheet-gluteos-followup-2026-08-04-",
  },
] as const;

const EXPECTED = {
  importLogs: 64,
  conversations: 62,
  withoutConversation: 2,
  byUnit: { SCS: 31, SBC: 13, Osasco: 18 },
} as const;

const ONE_TIME_TOKEN_HASH = "d0f5ff417d4cc9f3d943d278d679fe8459be71fac3fa5a6a5631084c388ab30e";

type ImportPayload = {
  leadgenId?: string;
  phone?: string;
};

function parsePayload(value: string | null): ImportPayload {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function isAuthorized(request: NextRequest) {
  const received = (request.headers.get("authorization") || "")
    .replace(/^Bearer\s+/i, "")
    .trim() || request.headers.get("x-zapier-secret")?.trim();

  if (!received) return false;
  const expectedBuffer = Buffer.from(ONE_TIME_TOKEN_HASH);
  const receivedBuffer = Buffer.from(createHash("sha256").update(received).digest("hex"));
  return expectedBuffer.length === receivedBuffer.length
    && timingSafeEqual(expectedBuffer, receivedBuffer);
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    const logs = await prisma.webhookLog.findMany({
      where: {
        source: "manual_google_sheet_import",
        OR: JOBS.map((job) => ({ id: { startsWith: job.prefix } })),
      },
      select: { id: true, payload: true },
    });

    if (logs.length !== EXPECTED.importLogs) {
      return NextResponse.json({
        error: "Escopo de logs divergiu da auditoria",
        expected: EXPECTED.importLogs,
        found: logs.length,
      }, { status: 409 });
    }

    const entries = logs.map((log) => {
      const job = JOBS.find((candidate) => log.id.startsWith(candidate.prefix));
      if (!job) throw new Error(`Log fora do escopo: ${log.id}`);
      return { job, payload: parsePayload(log.payload) };
    });
    const leadgenIds = [...new Set(entries.map(({ payload }) => payload.leadgenId).filter(Boolean))] as string[];
    const metaLeads = await prisma.metaLead.findMany({
      where: { leadgenId: { in: leadgenIds } },
      select: { leadgenId: true, phone: true },
    });
    const metaLeadById = new Map(metaLeads.map((lead) => [lead.leadgenId, lead]));
    const instanceIds = [...new Set(JOBS.map((job) => job.instanceId))];
    const conversations = await prisma.whatsAppConversation.findMany({
      where: {
        instanceId: { in: instanceIds },
        createdAt: { gte: new Date("2026-08-03T03:00:00.000Z") },
      },
      select: {
        id: true,
        instanceId: true,
        unreadCount: true,
        contact: { select: { phone: true } },
        messages: {
          where: { respondedByName: "Automação Meta" },
          select: { id: true },
          take: 1,
        },
      },
    });
    const conversationByInstanceAndPhone = new Map<string, (typeof conversations)[number]>();
    for (const conversation of conversations) {
      const phoneKey = phoneLookupKey(conversation.contact.phone);
      if (phoneKey) {
        conversationByInstanceAndPhone.set(`${conversation.instanceId}:${phoneKey}`, conversation);
      }
    }

    const scopedConversations = new Map<string, (typeof conversations)[number]>();
    let withoutConversation = 0;
    for (const entry of entries) {
      const metaLead = entry.payload.leadgenId ? metaLeadById.get(entry.payload.leadgenId) : undefined;
      const phoneKey = phoneLookupKey(entry.payload.phone || metaLead?.phone);
      const conversation = phoneKey
        ? conversationByInstanceAndPhone.get(`${entry.job.instanceId}:${phoneKey}`)
        : undefined;
      if (!conversation) {
        withoutConversation += 1;
        continue;
      }
      scopedConversations.set(conversation.id, conversation);
    }

    const scoped = [...scopedConversations.values()];
    const byUnit = Object.fromEntries(
      Object.keys(EXPECTED.byUnit).map((unit) => {
        const instanceId = JOBS.find((job) => job.unit === unit)?.instanceId;
        return [unit, scoped.filter((conversation) => conversation.instanceId === instanceId).length];
      }),
    );
    const hasUnexpectedScope = scoped.length !== EXPECTED.conversations
      || withoutConversation !== EXPECTED.withoutConversation
      || Object.entries(EXPECTED.byUnit).some(([unit, count]) => byUnit[unit] !== count)
      || scoped.some((conversation) => conversation.messages.length !== 1);

    if (hasUnexpectedScope) {
      return NextResponse.json({
        error: "Escopo de conversas divergiu da auditoria",
        expected: EXPECTED,
        found: {
          conversations: scoped.length,
          withoutConversation,
          byUnit,
          withAutomationMessage: scoped.filter((conversation) => conversation.messages.length === 1).length,
        },
      }, { status: 409 });
    }

    const before = {
      alreadyUnread: scoped.filter((conversation) => conversation.unreadCount > 0).length,
      unreadZero: scoped.filter((conversation) => conversation.unreadCount === 0).length,
    };
    const update = await prisma.whatsAppConversation.updateMany({
      where: {
        id: { in: scoped.map((conversation) => conversation.id) },
        instanceId: { in: instanceIds },
        unreadCount: 0,
      },
      data: { unreadCount: 1 },
    });
    const after = await prisma.whatsAppConversation.groupBy({
      by: ["instanceId"],
      where: {
        id: { in: scoped.map((conversation) => conversation.id) },
        unreadCount: { gt: 0 },
      },
      _count: { _all: true },
    });

    return NextResponse.json({
      success: true,
      scoped: scoped.length,
      updated: update.count,
      preservedUnread: before.alreadyUnread,
      before,
      afterUnreadByUnit: Object.fromEntries(after.map((group) => {
        const unit = JOBS.find((job) => job.instanceId === group.instanceId)?.unit || group.instanceId;
        return [unit, group._count._all];
      })),
      withoutConversation,
    });
  } catch (error) {
    console.error("[Manual Imported Unread Error]", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
