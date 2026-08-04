import { createHash, timingSafeEqual } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { phoneLookupKey } from "@/lib/phone";
import { findConversationByPhone } from "@/lib/whatsapp/conversation-starter";
import { getInstancePresentationSettings } from "@/lib/whatsapp/instance-presentation";

import { POST as processMetaLead } from "../route";

const JOB_TOKEN_HASH = "14b48e4d27ce3609f65f45c7cd50039aac3f3f732f5cdd868451490e8971d940";
const JOB_PREFIX = "manual-scs-sheet-gluteos-followup-2026-08-04";
const TARGET_INSTANCE_DISPLAY_NAME = "Thais Amorim Leads";
const SCS_FORM_ID = "1363070175195046";
const ALLOWED_LEAD_IDS = new Set([
  "899406812754761",
  "27661223580165199",
  "1333508488865286",
  "1031653113175973",
  "1615560016845847",
  "1363126208624155",
  "1568724161300699",
]);
const ALLOWED_CAMPAIGN_IDS = new Set([
  "120249007079180109",
  "120249310857180006",
]);
const ALLOWED_AD_IDS = new Set([
  "120249007495800109",
  "120249007079190109",
  "120249310857190006",
]);

function scalar(payload: Record<string, unknown>, key: string) {
  const value = payload[key];
  return typeof value === "string" ? value.trim() : "";
}

function normalizeText(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

function campaignNameFor(payload: Record<string, unknown>) {
  return normalizeText(scalar(payload, "ad_name")).includes("harmonizacao")
    ? "Harmonização de Glúteos"
    : "Glúteo Perfeito";
}

function addMetaAdsTag(tags: string | null) {
  const values = (tags || "").split(",").map((tag) => tag.trim()).filter(Boolean);
  if (!values.some((tag) => normalizeText(tag) === "meta ads")) values.push("Meta Ads");
  return values.join(",");
}

function isAuthorized(request: NextRequest) {
  const token = request.headers.get("x-virtuosa-manual-job") || "";
  const received = createHash("sha256").update(token).digest();
  const expected = Buffer.from(JOB_TOKEN_HASH, "hex");
  return received.length === expected.length && timingSafeEqual(received, expected);
}

function isAllowedPayload(payload: Record<string, unknown>) {
  if (!ALLOWED_LEAD_IDS.has(scalar(payload, "leadgen_id"))) return false;
  if (scalar(payload, "form_id") !== SCS_FORM_ID) return false;
  if (!ALLOWED_CAMPAIGN_IDS.has(scalar(payload, "campaign_id"))) return false;
  if (!ALLOWED_AD_IDS.has(scalar(payload, "ad_id"))) return false;
  if (!/^\+?\d{10,13}$/.test(scalar(payload, "phone_number"))) return false;

  const createdTime = scalar(payload, "created_time");
  const createdAt = new Date(createdTime);
  if (!Number.isFinite(createdAt.getTime()) || createdTime.slice(0, 10) !== "2026-08-04") return false;

  const adName = normalizeText(scalar(payload, "ad_name"));
  return adName.includes("harmonizacao")
    || (adName.includes("glute") && adName.includes("perfeit"));
}

async function targetInstance() {
  const { displayNames } = await getInstancePresentationSettings();
  const instanceId = Object.entries(displayNames).find(
    ([, name]) => normalizeText(name) === normalizeText(TARGET_INSTANCE_DISPLAY_NAME),
  )?.[0];
  if (!instanceId) throw new Error("Instância Thais Amorim Leads não encontrada");

  const instance = await prisma.whatsAppInstance.findUnique({
    where: { id: instanceId },
    select: { id: true, userId: true, unit: true, status: true },
  });
  if (!instance?.userId || instance.unit !== "SCS" || instance.status !== "connected") {
    throw new Error("Instância Thais Amorim Leads indisponível");
  }
  return { ...instance, userId: instance.userId };
}

async function isAlreadyPresent(payload: Record<string, unknown>, instanceId: string) {
  const phone = scalar(payload, "phone_number");
  const phoneKey = phoneLookupKey(phone);
  if (!phoneKey) return true;
  const [clients, conversation, metaLead] = await Promise.all([
    prisma.client.findMany({
      where: {
        isActive: true,
        phone: { contains: phoneKey.slice(-8) },
        OR: [{ unit: "SCS" }, { originUnit: "SCS" }],
      },
      select: { phone: true },
    }),
    findConversationByPhone({ phone, instanceIds: [instanceId] }),
    prisma.metaLead.findUnique({
      where: { leadgenId: scalar(payload, "leadgen_id") },
      select: { id: true },
    }),
  ]);
  return clients.some((client) => phoneLookupKey(client.phone) === phoneKey)
    || Boolean(conversation)
    || Boolean(metaLead);
}

async function repairProcessedLead(payload: Record<string, unknown>, whatsappStatus: string) {
  const leadgenId = scalar(payload, "leadgen_id");
  const phone = scalar(payload, "phone_number");
  const adId = scalar(payload, "ad_id");
  const campaignName = campaignNameFor(payload);
  const createdAt = new Date(scalar(payload, "created_time"));
  const instance = await targetInstance();
  const metaLead = await prisma.metaLead.findUnique({
    where: { leadgenId },
    select: { id: true, clientId: true },
  });
  if (!metaLead?.clientId) throw new Error("Lead processado sem cliente vinculado");
  const client = await prisma.client.findUnique({
    where: { id: metaLead.clientId },
    select: { id: true, tags: true, originUnit: true },
  });
  if (!client) throw new Error("Cliente processado não encontrado");

  await prisma.$transaction([
    prisma.client.update({
      where: { id: client.id },
      data: {
        campaignId: adId,
        campaignName,
        campaignAttribution: "automatic_meta",
        originUnit: client.originUnit || "SCS",
        tags: addMetaAdsTag(client.tags),
        arrivedAt: createdAt,
        createdAt,
      },
    }),
    prisma.metaLead.update({
      where: { id: metaLead.id },
      data: {
        formId: SCS_FORM_ID,
        adId,
        adName: scalar(payload, "ad_name"),
        campaignId: scalar(payload, "campaign_id"),
        campaignName,
        unit: "SCS",
        createdAt,
      },
    }),
    prisma.salesPipeline.updateMany({
      where: { clientId: client.id, stage: { notIn: ["fechado", "perdido"] } },
      data: {
        campaignIdSnapshot: adId,
        campaignNameSnapshot: campaignName,
        campaignAttributionSnapshot: "automatic_meta",
        createdAt,
      },
    }),
  ]);

  const conversation = await findConversationByPhone({ phone, instanceIds: [instance.id] });
  if (conversation) {
    const owner = await prisma.user.findUnique({
      where: { id: instance.userId },
      select: { name: true },
    });
    await prisma.whatsAppConversation.update({
      where: { id: conversation.id },
      data: {
        createdAt,
        assignedTo: instance.userId,
        assignedToName: owner?.name || "Thais Amorim",
      },
    });
  }

  await prisma.webhookLog.upsert({
    where: { id: `${JOB_PREFIX}-${leadgenId}` },
    create: {
      id: `${JOB_PREFIX}-${leadgenId}`,
      source: "manual_google_sheet_import",
      eventType: "meta_lead_scs_gluteos_followup",
      payload: JSON.stringify({ leadgenId, dateKey: "2026-08-04" }),
      status: `completed:${whatsappStatus}`,
      processedAt: new Date(),
    },
    update: {
      status: `completed:${whatsappStatus}`,
      errorMessage: null,
      processedAt: new Date(),
    },
  });
  return { conversationId: conversation?.id || null };
}

async function finalizeBatch() {
  const completed = await prisma.webhookLog.count({
    where: {
      id: { startsWith: `${JOB_PREFIX}-` },
      source: "manual_google_sheet_import",
      status: { startsWith: "completed:" },
    },
  });
  const instance = await targetInstance();
  if (completed > 0) {
    await prisma.crmLeadCountAdjustment.upsert({
      where: { adjustmentKey: `${JOB_PREFIX}-2026-08-04` },
      create: {
        adjustmentKey: `${JOB_PREFIX}-2026-08-04`,
        unit: "SCS",
        date: new Date("2026-08-04T00:00:00.000Z"),
        count: completed,
        reason: "Leads ausentes do formulário Meta SCS importados na data original",
        assignedTo: instance.userId,
        createdBy: "Automação Meta",
      },
      update: { count: completed, assignedTo: instance.userId, createdBy: "Automação Meta" },
    });
  }
  return { completed, adjustment: completed };
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Lote manual não autorizado" }, { status: 401 });
  }
  const payload = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (payload?.action === "finalize") {
    try {
      return NextResponse.json({ ok: true, ...(await finalizeBatch()) });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao finalizar lote";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }
  if (!payload || !isAllowedPayload(payload)) {
    return NextResponse.json({ error: "Lead fora do lote autorizado" }, { status: 422 });
  }

  try {
    const instance = await targetInstance();
    const batchLogId = `${JOB_PREFIX}-${scalar(payload, "leadgen_id")}`;
    const existingBatchLog = await prisma.webhookLog.findUnique({
      where: { id: batchLogId },
      select: { status: true },
    });
    if (!existingBatchLog && await isAlreadyPresent(payload, instance.id)) {
      return NextResponse.json({ ok: true, skipped: "already_present" });
    }

    await prisma.webhookLog.upsert({
      where: { id: batchLogId },
      create: {
        id: batchLogId,
        source: "manual_google_sheet_import",
        eventType: "meta_lead_scs_gluteos_followup",
        payload: JSON.stringify({ leadgenId: scalar(payload, "leadgen_id"), dateKey: "2026-08-04" }),
        status: "processing",
      },
      update: { status: "processing", errorMessage: null },
    });

    const secret = process.env.META_ZAPIER_WEBHOOK_SECRET?.trim();
    if (!secret) throw new Error("Integração Meta não configurada");
    const internalRequest = new NextRequest(request.url, {
      method: "POST",
      headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const processedResponse = await processMetaLead(internalRequest);
    const processedBody = await processedResponse.json().catch(() => ({}));
    if (!processedResponse.ok) {
      throw new Error(processedBody.error || `Integração Meta HTTP ${processedResponse.status}`);
    }

    const whatsappStatus = String(processedBody.whatsapp || processedBody.status || "processed");
    const repaired = await repairProcessedLead(payload, whatsappStatus);
    return NextResponse.json({ ok: true, whatsapp: whatsappStatus, ...repaired });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao processar lote";
    await prisma.webhookLog.updateMany({
      where: { id: `${JOB_PREFIX}-${scalar(payload, "leadgen_id")}` },
      data: { status: "error", errorMessage: message.slice(0, 1000), processedAt: new Date() },
    }).catch(() => undefined);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
