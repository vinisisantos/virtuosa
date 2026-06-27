import { NextRequest, NextResponse } from "next/server";

import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { inferCampaignNameFromSignal } from "@/lib/campaign-attribution";

function digitsOnly(value?: string | null) {
  return (value || "").replace(/\D/g, "");
}

function safeJson(value?: string | null): any | null {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function collectText(value: any): string[] {
  if (!value) return [];
  if (typeof value === "string") return [value];
  if (typeof value !== "object") return [];

  const keys = [
    "detectedCampaign",
    "managedCampaignName",
    "keywordCampaignName",
    "adSourceUrl",
    "title",
    "body",
    "description",
    "sourceUrl",
    "source_url",
    "text",
    "caption",
  ];

  const parts: string[] = [];
  for (const key of keys) {
    if (typeof value[key] === "string") parts.push(value[key]);
  }

  for (const nestedKey of ["adReplyRaw", "rawMessage", "message", "imageMessage", "extendedTextMessage"]) {
    parts.push(...collectText(value[nestedKey]));
  }

  return parts;
}

function findSourceUrl(value: any): string | null {
  if (!value || typeof value !== "object") return null;
  for (const key of ["adSourceUrl", "sourceUrl", "source_url"]) {
    const candidate = value[key];
    if (typeof candidate === "string" && /^https?:\/\//i.test(candidate)) return candidate;
  }
  for (const nestedKey of ["adReplyRaw", "rawMessage", "message", "imageMessage", "extendedTextMessage"]) {
    const nested = findSourceUrl(value[nestedKey]);
    if (nested) return nested;
  }
  return null;
}

// POST /api/campaigns/retroactive-ctwa
// Body: { phone: string, dryRun?: boolean }
export async function POST(req: NextRequest) {
  const auth = await requireRole(req, ["ADMINISTRADOR"]);
  if ("error" in auth) return auth.error;

  try {
    const body = await req.json();
    const phone = digitsOnly(body?.phone);
    const dryRun = body?.dryRun === true;
    if (phone.length < 8) {
      return NextResponse.json({ error: "Telefone obrigatório" }, { status: 400 });
    }

    const suffix = phone.slice(-8);
    const contact = await prisma.whatsAppContact.findFirst({
      where: { phone: { contains: suffix } },
      include: {
        conversations: {
          include: {
            instance: { select: { id: true, name: true, unit: true } },
            messages: {
              orderBy: { timestamp: "asc" },
              take: 20,
              select: { body: true, type: true, fromMe: true, timestamp: true },
            },
          },
          orderBy: { lastMessageAt: "desc" },
        },
      },
    });

    if (!contact) {
      return NextResponse.json({ error: "Contato WhatsApp não encontrado", phone, suffix }, { status: 404 });
    }

    const conversation = contact.conversations[0] || null;
    const unit = conversation?.instance?.unit || contact.unit || auth.user.unit || null;

    const logs = await prisma.webhookLog.findMany({
      where: {
        source: "whatsapp_ad",
        OR: [
          { payload: { contains: contact.phone } },
          { payload: { contains: phone } },
          { payload: { contains: suffix } },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, payload: true, createdAt: true },
    });

    const parsedLogs = logs.map((log) => safeJson(log.payload)).filter(Boolean);
    const signalParts = [
      ...parsedLogs.flatMap(collectText),
      ...((conversation?.messages || []).map((message) => message.body).filter(Boolean) as string[]),
    ];
    const signal = signalParts.join(" ");
    const sourceUrl = parsedLogs.map(findSourceUrl).find(Boolean) || null;
    const inferred = await inferCampaignNameFromSignal(signal, unit);

    if (!inferred.campaignName) {
      return NextResponse.json({
        success: false,
        reason: "Nenhuma campanha reconhecida para este chat",
        phone: contact.phone,
        contactName: contact.name,
        unit,
        logsFound: logs.length,
        signalPreview: signal.slice(0, 700),
      });
    }

    let client = await prisma.client.findFirst({
      where: {
        isActive: true,
        OR: [
          { phone: { contains: contact.phone } },
          { phone: { contains: phone } },
          { phone: { contains: suffix } },
        ],
      },
      orderBy: { updatedAt: "desc" },
    });

    const before = client
      ? { id: client.id, name: client.name, phone: client.phone, campaignName: client.campaignName, source: client.source, unit: client.unit }
      : null;

    if (!dryRun) {
      if (!client) {
        client = await prisma.client.create({
          data: {
            name: contact.name || `Lead WhatsApp ${contact.phone}`,
            phone: contact.phone,
            source: "facebook_ad",
            campaignName: inferred.campaignName,
            fbclid: sourceUrl || undefined,
            unit: unit || "SCS",
            stage: "entrada",
          },
        });
      } else {
        client = await prisma.client.update({
          where: { id: client.id },
          data: {
            source: "facebook_ad",
            campaignName: inferred.campaignName,
            ...(sourceUrl && !client.fbclid ? { fbclid: sourceUrl } : {}),
          },
        });
      }
    }

    return NextResponse.json({
      success: true,
      dryRun,
      phone: contact.phone,
      contactName: contact.name,
      unit,
      campaignName: inferred.campaignName,
      managedCampaignName: inferred.managedCampaignName,
      keywordCampaignName: inferred.keywordCampaignName,
      sourceUrl,
      logsFound: logs.length,
      before,
      after: client
        ? { id: client.id, name: client.name, phone: client.phone, campaignName: client.campaignName, source: client.source, unit: client.unit }
        : null,
      signalPreview: signal.slice(0, 700),
    });
  } catch (error) {
    console.error("[POST /api/campaigns/retroactive-ctwa]", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
