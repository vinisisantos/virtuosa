import { NextRequest, NextResponse } from "next/server";

import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { inferCampaignNameFromSignal } from "@/lib/campaign-attribution";
import { extractAdIdFromSourceUrl, resolveCampaignFromAdId } from "@/lib/lead-processor";
import { campaignNamesMatch, isGenericCampaignName } from "@/lib/campaign-labels";

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

function shouldReprocessCampaignName(value: string | null | undefined, reprocessCampaigns: string[]) {
  if (isGenericCampaignName(value)) return true;
  if (reprocessCampaigns.length === 0) return false;

  return reprocessCampaigns.some((campaignName) => campaignNamesMatch(value, campaignName));
}

type ContactWithConversations = Awaited<ReturnType<typeof findContactByPhone>>;

async function findContactByPhone(phone: string) {
  const suffix = phone.slice(-8);
  return prisma.whatsAppContact.findFirst({
    where: { phone: { contains: suffix } },
    include: {
      conversations: {
        include: {
          instance: { select: { id: true, name: true, unit: true } },
          messages: {
            orderBy: { timestamp: "asc" },
            take: 80,
            select: { body: true, type: true, fromMe: true, timestamp: true },
          },
        },
        orderBy: { lastMessageAt: "desc" },
      },
    },
  });
}

async function inferContactCampaign(params: {
  contact: NonNullable<ContactWithConversations>;
  phone: string;
  fallbackUnit?: string | null;
}) {
  const { contact, phone, fallbackUnit } = params;
  const suffix = phone.slice(-8);
  const conversation = contact.conversations[0] || null;
  const unit = conversation?.instance?.unit || contact.unit || fallbackUnit || null;

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
  const sourceAdId = extractAdIdFromSourceUrl(sourceUrl);
  const resolved = sourceAdId
    ? await resolveCampaignFromAdId(sourceAdId, unit)
    : null;
  const inferred = await inferCampaignNameFromSignal(
    [resolved?.campaignName, resolved?.adName, signal].filter(Boolean).join(" "),
    unit
  );
  const leadArrivedAt =
    conversation?.messages.find((message) => !message.fromMe)?.timestamp ||
    conversation?.messages[0]?.timestamp ||
    null;

  return {
    unit,
    logs,
    signal,
    sourceUrl,
    inferred,
    leadArrivedAt,
  };
}

async function classifyPhone(params: {
  phone: string;
  dryRun: boolean;
  fallbackUnit?: string | null;
  existingClient?: {
    id: string;
    name: string;
    phone: string | null;
    campaignName: string | null;
    source: string | null;
    unit: string | null;
    fbclid?: string | null;
  } | null;
  createClientIfMissing?: boolean;
  reprocessCampaigns?: string[];
}) {
  const phone = digitsOnly(params.phone);
  const suffix = phone.slice(-8);
  const contact = await findContactByPhone(phone);

  if (!contact) {
    return {
      success: false,
      reason: "Contato WhatsApp não encontrado",
      phone,
      suffix,
    };
  }

  const inferredContext = await inferContactCampaign({
    contact,
    phone,
    fallbackUnit: params.fallbackUnit,
  });

  if (!inferredContext.inferred.campaignName) {
    return {
      success: false,
      reason: "Nenhuma campanha reconhecida para este chat",
      phone: contact.phone,
      contactName: contact.name,
      unit: inferredContext.unit,
      logsFound: inferredContext.logs.length,
      signalPreview: inferredContext.signal.slice(0, 700),
    };
  }

  let client = params.existingClient
    ? await prisma.client.findUnique({ where: { id: params.existingClient.id } })
    : await prisma.client.findFirst({
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

  const shouldUpdateSpecificCampaign =
    !!client?.campaignName &&
    !isGenericCampaignName(client.campaignName) &&
    (params.reprocessCampaigns || []).length > 0 &&
    shouldReprocessCampaignName(client.campaignName, params.reprocessCampaigns || []) &&
    client.campaignName !== inferredContext.inferred.campaignName;

  const before = client
    ? { id: client.id, name: client.name, phone: client.phone, campaignName: client.campaignName, source: client.source, unit: client.unit }
    : null;

  if (!client && params.createClientIfMissing !== true) {
    return {
      success: false,
      reason: "Cliente existente nao encontrado; retroclassificacao segura nao cria lead",
      phone: contact.phone,
      contactName: contact.name,
      unit: inferredContext.unit,
      campaignName: inferredContext.inferred.campaignName,
      managedCampaignName: inferredContext.inferred.managedCampaignName,
      keywordCampaignName: inferredContext.inferred.keywordCampaignName,
      sourceUrl: inferredContext.sourceUrl,
      logsFound: inferredContext.logs.length,
      before,
      signalPreview: inferredContext.signal.slice(0, 700),
    };
  }

  if (!params.dryRun) {
    if (!client && params.createClientIfMissing === true) {
      client = await prisma.client.create({
        data: {
          name: contact.name || `Lead WhatsApp ${contact.phone}`,
          phone: contact.phone,
          source: "facebook_ad",
          campaignName: inferredContext.inferred.campaignName,
          fbclid: inferredContext.sourceUrl || undefined,
          arrivedAt: inferredContext.leadArrivedAt || new Date(),
          unit: inferredContext.unit || "SCS",
          stage: "entrada",
        },
      });
    } else if (client) {
      client = await prisma.client.update({
        where: { id: client.id },
        data: {
          source: "facebook_ad",
          campaignName: inferredContext.inferred.campaignName,
          ...(inferredContext.sourceUrl && !client.fbclid ? { fbclid: inferredContext.sourceUrl } : {}),
          ...(!client.arrivedAt && inferredContext.leadArrivedAt ? { arrivedAt: inferredContext.leadArrivedAt } : {}),
        },
      });
    }
  }

  return {
    success: true,
    dryRun: params.dryRun,
    phone: contact.phone,
    contactName: contact.name,
    unit: inferredContext.unit,
    campaignName: inferredContext.inferred.campaignName,
    changedSpecificCampaign: shouldUpdateSpecificCampaign,
    managedCampaignName: inferredContext.inferred.managedCampaignName,
    keywordCampaignName: inferredContext.inferred.keywordCampaignName,
    sourceUrl: inferredContext.sourceUrl,
    logsFound: inferredContext.logs.length,
    before,
    after: client
      ? { id: client.id, name: client.name, phone: client.phone, campaignName: client.campaignName, source: client.source, unit: client.unit }
      : null,
    signalPreview: inferredContext.signal.slice(0, 700),
  };
}

// POST /api/campaigns/retroactive-ctwa
// Body: { phone: string, dryRun?: boolean, createClientIfMissing?: boolean }
// ou { mode: "bulk", dryRun?: boolean, unit?: string, limit?: number }
export async function POST(req: NextRequest) {
  const auth = await requireRole(req, ["ADMINISTRADOR"]);
  if ("error" in auth) return auth.error;

  try {
    const body = await req.json();
    const dryRun = body?.dryRun === true;

    if (body?.mode === "bulk") {
      const limit = Math.max(1, Math.min(Number(body?.limit) || 50, 200));
      const unit = typeof body?.unit === "string" && body.unit.trim() ? body.unit.trim() : undefined;
      const reprocessCampaigns: string[] = Array.isArray(body?.reprocessCampaigns)
        ? body.reprocessCampaigns
            .filter((item: unknown): item is string => typeof item === "string" && item.trim().length > 0)
            .map((item: string) => item.trim())
        : [];

      const clients = await prisma.client.findMany({
        where: {
          isActive: true,
          ...(unit ? { unit } : {}),
          OR: [
            { campaignName: null },
            { campaignName: "" },
            { campaignName: { equals: "Converse conosco", mode: "insensitive" } },
            { campaignName: { equals: "Desconhecido", mode: "insensitive" } },
            { campaignName: { equals: "Desconhecida", mode: "insensitive" } },
            { campaignName: { equals: "Anúncio no Status", mode: "insensitive" } },
            { campaignName: { startsWith: "Campanha Desconhecida", mode: "insensitive" } },
            ...reprocessCampaigns.map((campaignName) => ({
              campaignName: { equals: campaignName, mode: "insensitive" as const },
            })),
          ],
        },
        orderBy: { updatedAt: "desc" },
        take: limit,
        select: {
          id: true,
          name: true,
          phone: true,
          campaignName: true,
          source: true,
          unit: true,
          fbclid: true,
        },
      });

      const results = [];
      for (const client of clients) {
        if (!client.phone || !shouldReprocessCampaignName(client.campaignName, reprocessCampaigns)) {
          results.push({
            success: false,
            reason: "Cliente sem telefone ou campanha fora do escopo de reprocessamento",
            clientId: client.id,
            name: client.name,
            phone: client.phone,
            campaignName: client.campaignName,
          });
          continue;
        }

        results.push(await classifyPhone({
          phone: client.phone,
          dryRun,
          fallbackUnit: client.unit || auth.user.unit,
          existingClient: client,
          createClientIfMissing: false,
          reprocessCampaigns,
        }));
      }

      return NextResponse.json({
        success: true,
        dryRun,
        mode: "bulk",
        unit: unit || null,
        limit,
        reprocessCampaigns,
        scanned: clients.length,
        classified: results.filter((item: any) => item.success && item.campaignName).length,
        updated: dryRun ? 0 : results.filter((item: any) => item.success && item.after?.campaignName === item.campaignName).length,
        results,
      });
    }

    const phone = digitsOnly(body?.phone);
    if (phone.length < 8) {
      return NextResponse.json({ error: "Telefone obrigatório" }, { status: 400 });
    }

    const result = await classifyPhone({
      phone,
      dryRun,
      fallbackUnit: auth.user.unit,
      createClientIfMissing: body?.createClientIfMissing === true,
    });
    return NextResponse.json(result, result.success ? undefined : { status: result.reason === "Contato WhatsApp não encontrado" ? 404 : 200 });
  } catch (error) {
    console.error("[POST /api/campaigns/retroactive-ctwa]", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
