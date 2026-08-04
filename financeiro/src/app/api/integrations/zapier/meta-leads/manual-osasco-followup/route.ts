import { createHash, timingSafeEqual } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { phoneLookupKey } from "@/lib/phone";
import { findConversationByPhone } from "@/lib/whatsapp/conversation-starter";
import { getInstancePresentationSettings } from "@/lib/whatsapp/instance-presentation";

import { POST as processMetaLead } from "../route";

const JOB_TOKEN_HASH = "ab221dfedb6dd655b21061aeeea7dfcb7dc5f2e7fee8f00358c98cf0b576bf98";
const JOB_PREFIX = "manual-osasco-sheet-gluteos-followup-2026-08-04";
const TARGET_INSTANCE_DISPLAY_NAME = "Leads Osasco";
const OSASCO_FORM_ID = "1325369796250945";
const ALLOWED_LEAD_IDS = new Set([
  "1470466335103573",
  "1607644190930870",
  "1356019816185257",
  "1377383987811540",
  "1019859937535382",
  "1359761135680829",
  "2289715354765709",
  "1510218527525674",
  "27981307311532424",
  "1577062060789416",
]);
const ALLOWED_CAMPAIGN_IDS = new Set([
  "120249321672820006",
  "120251954010730494",
]);
const ALLOWED_AD_IDS = new Set([
  "120249321672810006",
  "120249321848920006",
  "120251954010740494",
  "120251954844540494",
]);
const UNIT_ISOLATION_REPAIRS = [
  {
    leadgenId: "2289715354765709",
    oldClientId: "079181b7-bb1e-483f-bf47-17c67892d4d0",
    oldPipelineId: "c6b5e19e-d050-42eb-98b9-c0aeae991795",
    newClientId: "a3fc824f-4656-4755-b215-95e08634079d",
    newPipelineId: "a6808ade-ce18-45ed-b23e-40456eb30cec",
    scsClientCreatedAt: new Date("2026-08-04T13:04:15.000Z"),
    scsPipelineCreatedAt: new Date("2026-08-04T13:04:17.708Z"),
  },
  {
    leadgenId: "1377383987811540",
    oldClientId: "75a4e047-d255-4688-a44a-78f9f0b425f7",
    oldPipelineId: "16964a23-0d7f-4490-9dc7-ca4fd6ff7caf",
    newClientId: "5ff9fe1e-dbb7-47be-956a-9aa123e79b94",
    newPipelineId: "d1830c53-6b44-4daf-b59a-ff9d63b40b95",
    scsClientCreatedAt: new Date("2026-08-04T13:42:03.000Z"),
    scsPipelineCreatedAt: new Date("2026-08-04T13:42:05.739Z"),
  },
];

function scalar(payload: Record<string, unknown>, key: string) {
  const value = payload[key];
  return typeof value === "string" ? value.trim() : "";
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
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
  const leadgenId = scalar(payload, "leadgen_id");
  if (!ALLOWED_LEAD_IDS.has(leadgenId)) return false;
  if (scalar(payload, "form_id") !== OSASCO_FORM_ID) return false;
  if (!ALLOWED_CAMPAIGN_IDS.has(scalar(payload, "campaign_id"))) return false;
  if (!ALLOWED_AD_IDS.has(scalar(payload, "ad_id"))) return false;
  if (!/^\+?\d{10,13}$/.test(scalar(payload, "phone_number"))) return false;

  const createdAt = new Date(scalar(payload, "created_time"));
  if (!Number.isFinite(createdAt.getTime()) || scalar(payload, "created_time").slice(0, 10) !== "2026-08-04") {
    return false;
  }

  const adName = normalizeText(scalar(payload, "ad_name"));
  return adName.includes("harmonizacao")
    || (adName.includes("glute") && adName.includes("perfeit"));
}

async function targetInstance() {
  const { displayNames } = await getInstancePresentationSettings();
  const instanceId = Object.entries(displayNames).find(
    ([, name]) => normalizeText(name) === normalizeText(TARGET_INSTANCE_DISPLAY_NAME),
  )?.[0];
  if (!instanceId) throw new Error("Instância Leads Osasco não encontrada");

  const instance = await prisma.whatsAppInstance.findUnique({
    where: { id: instanceId },
    select: { id: true, userId: true, unit: true, status: true },
  });
  if (!instance?.userId || instance.unit !== "Osasco" || instance.status !== "connected") {
    throw new Error("Instância Leads Osasco indisponível");
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
        OR: [{ unit: "Osasco" }, { originUnit: "Osasco" }],
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
        originUnit: client.originUnit || "Osasco",
        tags: addMetaAdsTag(client.tags),
        arrivedAt: createdAt,
        createdAt,
      },
    }),
    prisma.metaLead.update({
      where: { id: metaLead.id },
      data: {
        formId: OSASCO_FORM_ID,
        adId,
        adName: scalar(payload, "ad_name"),
        campaignId: scalar(payload, "campaign_id"),
        campaignName,
        unit: "Osasco",
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
      eventType: "meta_lead_osasco_gluteos_followup",
      payload: JSON.stringify({ leadgenId, dateKey: "2026-08-04" }),
      status: `completed:${whatsappStatus}`,
      processedAt: new Date(),
    },
    update: {
      payload: JSON.stringify({ leadgenId, dateKey: "2026-08-04" }),
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
        unit: "Osasco",
        date: new Date("2026-08-04T00:00:00.000Z"),
        count: completed,
        reason: "Leads ausentes do formulário Meta Osasco importados na data original",
        assignedTo: instance.userId,
        createdBy: "Automação Meta",
      },
      update: { count: completed, assignedTo: instance.userId, createdBy: "Automação Meta" },
    });
  }

  return { completed, adjustment: completed };
}

async function repairUnitIsolation() {
  const [instance, pipeline] = await Promise.all([
    targetInstance(),
    prisma.pipeline.findFirst({
      where: { unit: "Osasco" },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    }),
  ]);
  const [owner, firstStage] = await Promise.all([
    prisma.user.findUnique({
      where: { id: instance.userId },
      select: { name: true },
    }),
    pipeline
      ? prisma.pipelineStage.findFirst({
          where: { pipelineId: pipeline.id },
          orderBy: { position: "asc" },
          select: { id: true },
        })
      : null,
  ]);

  const results = [];
  for (const repair of UNIT_ISOLATION_REPAIRS) {
    const metaLead = await prisma.metaLead.findUnique({
      where: { leadgenId: repair.leadgenId },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        adId: true,
        campaignName: true,
        createdAt: true,
      },
    });
    if (!metaLead?.phone || !metaLead.adId || !metaLead.campaignName) {
      throw new Error(`MetaLead incompleto: ${repair.leadgenId}`);
    }

    await prisma.$transaction([
      prisma.client.upsert({
        where: { id: repair.newClientId },
        create: {
          id: repair.newClientId,
          name: metaLead.name || "Lead sem nome",
          phone: metaLead.phone,
          email: metaLead.email,
          source: "meta_ads",
          campaignId: metaLead.adId,
          campaignName: metaLead.campaignName,
          campaignAttribution: "automatic_meta",
          stage: "entrada",
          unit: "Osasco",
          originUnit: "Osasco",
          tags: "Meta Ads",
          arrivedAt: metaLead.createdAt,
          createdAt: metaLead.createdAt,
          userId: instance.userId,
        },
        update: {
          campaignId: metaLead.adId,
          campaignName: metaLead.campaignName,
          campaignAttribution: "automatic_meta",
          unit: "Osasco",
          originUnit: "Osasco",
          arrivedAt: metaLead.createdAt,
          createdAt: metaLead.createdAt,
          userId: instance.userId,
        },
      }),
      prisma.salesPipeline.upsert({
        where: { id: repair.newPipelineId },
        create: {
          id: repair.newPipelineId,
          clientId: repair.newClientId,
          clientName: metaLead.name || "Lead sem nome",
          stage: "novo_lead",
          pipelineId: pipeline?.id,
          stageId: firstStage?.id,
          source: "meta_ads",
          assignedTo: instance.userId,
          assignedName: owner?.name || "Thais Amorim",
          unit: "Osasco",
          leadId: metaLead.id,
          campaignIdSnapshot: metaLead.adId,
          campaignNameSnapshot: metaLead.campaignName,
          campaignAttributionSnapshot: "automatic_meta",
          createdAt: metaLead.createdAt,
        },
        update: {
          clientId: repair.newClientId,
          clientName: metaLead.name || "Lead sem nome",
          pipelineId: pipeline?.id,
          stageId: firstStage?.id,
          assignedTo: instance.userId,
          assignedName: owner?.name || "Thais Amorim",
          unit: "Osasco",
          campaignIdSnapshot: metaLead.adId,
          campaignNameSnapshot: metaLead.campaignName,
          campaignAttributionSnapshot: "automatic_meta",
          createdAt: metaLead.createdAt,
        },
      }),
      prisma.metaLead.update({
        where: { id: metaLead.id },
        data: { clientId: repair.newClientId },
      }),
      prisma.client.update({
        where: { id: repair.oldClientId },
        data: {
          campaignId: null,
          campaignName: "Glúteo Perfeito",
          campaignAttribution: "automatic_meta",
          arrivedAt: repair.scsClientCreatedAt,
          createdAt: repair.scsClientCreatedAt,
        },
      }),
      prisma.salesPipeline.update({
        where: { id: repair.oldPipelineId },
        data: {
          campaignIdSnapshot: null,
          campaignNameSnapshot: "Glúteo Perfeito",
          campaignAttributionSnapshot: "automatic_meta",
          createdAt: repair.scsPipelineCreatedAt,
        },
      }),
    ]);
    results.push({ leadgenId: repair.leadgenId, separated: true });
  }

  return { repaired: results.length, results };
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
  if (payload?.action === "repair_unit_isolation") {
    try {
      return NextResponse.json({ ok: true, ...(await repairUnitIsolation()) });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao separar unidades";
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
        eventType: "meta_lead_osasco_gluteos_followup",
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
