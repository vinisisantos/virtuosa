import { createHash, timingSafeEqual } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { pickBestCampaignClient } from "@/lib/campaign-client-selection";
import { prisma } from "@/lib/db";
import { assignLeadToOperator } from "@/lib/lead-assigner";
import { phoneLookupKey } from "@/lib/phone";
import { findConversationByPhone } from "@/lib/whatsapp/conversation-starter";
import { getInstancePresentationSettings } from "@/lib/whatsapp/instance-presentation";

import { POST as processMetaLead } from "../route";

const JOB_TOKEN_HASH = "1926a06758980e6b498b34692a481f30f4396d42cb0b4516f7392a7d1cb56e19";
const SBC_FORM_ID = "2475297602894575";
const SBC_CAMPAIGN_IDS = new Set([
  "120247237187740077",
  "120249304650500006",
]);
const SBC_AD_IDS = new Set([
  "120247237187760077",
  "120247237450560077",
  "120249304650490006",
]);
const RANGE_START = new Date("2026-08-03T16:09:25-03:00").getTime();
const RANGE_END = new Date("2026-08-04T01:49:10-03:00").getTime();
const JOB_PREFIX = "manual-sbc-sheet-gluteos-2026-08-04";
const TARGET_INSTANCE_DISPLAY_NAME = "Leads - Paloma";

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

function isAuthorized(request: NextRequest) {
  const token = request.headers.get("x-virtuosa-manual-job") || "";
  const received = createHash("sha256").update(token).digest();
  const expected = Buffer.from(JOB_TOKEN_HASH, "hex");
  return received.length === expected.length && timingSafeEqual(received, expected);
}

function isAllowedPayload(payload: Record<string, unknown>) {
  if (!/^\d+$/.test(scalar(payload, "leadgen_id"))) return false;
  if (scalar(payload, "form_id") !== SBC_FORM_ID) return false;
  if (!SBC_CAMPAIGN_IDS.has(scalar(payload, "campaign_id"))) return false;
  if (!SBC_AD_IDS.has(scalar(payload, "ad_id"))) return false;
  if (!/^\+?\d{10,13}$/.test(scalar(payload, "phone_number"))) return false;

  const createdAt = new Date(scalar(payload, "created_time")).getTime();
  if (!Number.isFinite(createdAt) || createdAt < RANGE_START || createdAt > RANGE_END) {
    return false;
  }

  const adName = normalizeText(scalar(payload, "ad_name"));
  return adName.includes("harmonizacao")
    || (adName.includes("glute") && adName.includes("perfeit"));
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

async function targetInstance() {
  const { displayNames } = await getInstancePresentationSettings();
  const instanceId = Object.entries(displayNames).find(
    ([, name]) => name === TARGET_INSTANCE_DISPLAY_NAME,
  )?.[0];
  if (!instanceId) throw new Error("Instância Leads Paloma não encontrada");

  const instance = await prisma.whatsAppInstance.findUnique({
    where: { id: instanceId },
    select: { id: true, userId: true, unit: true, status: true },
  });
  if (!instance?.userId || instance.unit !== "SBC" || instance.status !== "connected") {
    throw new Error("Instância Leads Paloma indisponível");
  }
  return { ...instance, userId: instance.userId };
}

async function repairLead(payload: Record<string, unknown>) {
  const phone = scalar(payload, "phone_number");
  const phoneKey = phoneLookupKey(phone);
  if (!phoneKey) throw new Error("Telefone sem chave de comparação");

  const createdAt = new Date(scalar(payload, "created_time"));
  const campaignName = campaignNameFor(payload);
  const adId = scalar(payload, "ad_id");
  const leadgenId = scalar(payload, "leadgen_id");
  const name = scalar(payload, "full_name") || "Lead sem nome";

  const candidates = await prisma.client.findMany({
    where: { isActive: true, phone: { contains: phoneKey.slice(-8) } },
    select: {
      id: true,
      phone: true,
      unit: true,
      originUnit: true,
      source: true,
      fbclid: true,
      campaignName: true,
      campaignId: true,
      tags: true,
      updatedAt: true,
    },
  });
  const sbcCandidates = candidates.filter((client) =>
    phoneLookupKey(client.phone) === phoneKey
    && (client.originUnit === "SBC" || client.unit === "SBC")
  );
  const selected = pickBestCampaignClient(sbcCandidates);
  const client = selected
    ? await prisma.client.update({
        where: { id: selected.id },
        data: {
          campaignId: adId,
          campaignName,
          campaignAttribution: "automatic_meta",
          originUnit: selected.originUnit || "SBC",
          tags: addMetaAdsTag(selected.tags),
        },
        select: { id: true },
      })
    : await prisma.client.create({
        data: {
          name,
          phone,
          source: "meta_ads",
          campaignId: adId,
          campaignName,
          campaignAttribution: "automatic_meta",
          stage: "entrada",
          unit: "SBC",
          originUnit: "SBC",
          tags: "Meta Ads",
          arrivedAt: createdAt,
          createdAt,
        },
        select: { id: true },
      });

  await prisma.metaLead.upsert({
    where: { leadgenId },
    create: {
      leadgenId,
      formId: scalar(payload, "form_id"),
      formName: scalar(payload, "form_name"),
      adId,
      adName: scalar(payload, "ad_name"),
      campaignId: scalar(payload, "campaign_id"),
      campaignName,
      platform: scalar(payload, "platform") || "facebook",
      name,
      phone,
      rawData: JSON.stringify(payload),
      clientId: client.id,
      unit: "SBC",
      status: "processado",
      processedAt: new Date(),
      createdAt,
    },
    update: {
      formId: scalar(payload, "form_id"),
      formName: scalar(payload, "form_name"),
      adId,
      adName: scalar(payload, "ad_name"),
      campaignId: scalar(payload, "campaign_id"),
      campaignName,
      platform: scalar(payload, "platform") || "facebook",
      name,
      phone,
      rawData: JSON.stringify(payload),
      clientId: client.id,
      unit: "SBC",
      errorMessage: null,
      processedAt: new Date(),
    },
  });

  const activeDeal = await prisma.salesPipeline.findFirst({
    where: { clientId: client.id, stage: { notIn: ["fechado", "perdido"] } },
    select: { id: true },
  });
  if (activeDeal) {
    await prisma.salesPipeline.update({
      where: { id: activeDeal.id },
      data: {
        campaignIdSnapshot: adId,
        campaignNameSnapshot: campaignName,
        campaignAttributionSnapshot: "automatic_meta",
      },
    });
  } else {
    const assignment = await assignLeadToOperator("SBC");
    const pipeline = await prisma.pipeline.findFirst({
      where: { unit: "SBC" },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    const firstStage = pipeline
      ? await prisma.pipelineStage.findFirst({
          where: { pipelineId: pipeline.id },
          orderBy: { position: "asc" },
          select: { id: true },
        })
      : null;
    await prisma.salesPipeline.create({
      data: {
        clientId: client.id,
        clientName: name,
        stage: "novo_lead",
        pipelineId: pipeline?.id,
        stageId: firstStage?.id,
        unit: "SBC",
        source: "meta_ads",
        assignedTo: assignment?.userId,
        assignedName: assignment?.userName,
        leadId: leadgenId,
        campaignIdSnapshot: adId,
        campaignNameSnapshot: campaignName,
        campaignAttributionSnapshot: "automatic_meta",
        createdAt,
      },
    });
  }

  return { clientId: client.id, phone, leadgenId, createdAt };
}

async function finalizeBatch() {
  const logs = await prisma.webhookLog.findMany({
    where: { id: { startsWith: `${JOB_PREFIX}-` }, source: "manual_google_sheet_import" },
    select: { payload: true },
  });
  const adjustments = new Map<string, number>();
  for (const log of logs) {
    try {
      const payload = JSON.parse(log.payload || "{}") as { dateKey?: string };
      if (payload.dateKey) adjustments.set(payload.dateKey, (adjustments.get(payload.dateKey) || 0) + 1);
    } catch {
      // Logs deste lote são controlados; uma linha inválida não deve bloquear as demais.
    }
  }

  const instance = await targetInstance();
  for (const [dateKey, count] of adjustments) {
    await prisma.crmLeadCountAdjustment.upsert({
      where: { adjustmentKey: `${JOB_PREFIX}-${dateKey}` },
      create: {
        adjustmentKey: `${JOB_PREFIX}-${dateKey}`,
        unit: "SBC",
        date: new Date(`${dateKey}T00:00:00.000Z`),
        count,
        reason: "Leads do formulário Meta SBC importados da planilha na data original",
        assignedTo: instance.userId,
        createdBy: "Automação Meta",
      },
      update: { count, assignedTo: instance.userId, createdBy: "Automação Meta" },
    });
  }
  return { imported: logs.length, adjustments: Object.fromEntries(adjustments) };
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

  const secret = process.env.META_ZAPIER_WEBHOOK_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ error: "Integração não configurada" }, { status: 503 });
  }

  const internalRequest = new NextRequest(request.url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${secret}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const processedResponse = await processMetaLead(internalRequest);
  const processedBody = await processedResponse.json().catch(() => ({}));

  try {
    const repaired = await repairLead(payload);
    if (payload.manual_import_missing === true) {
      const instance = await targetInstance();
      const conversation = await findConversationByPhone({
        phone: repaired.phone,
        instanceIds: [instance.id],
      });
      if (conversation) {
        const owner = await prisma.user.findUnique({
          where: { id: instance.userId },
          select: { name: true },
        });
        await prisma.whatsAppConversation.update({
          where: { id: conversation.id },
          data: {
            createdAt: repaired.createdAt,
            assignedTo: instance.userId,
            assignedToName: owner?.name || "Paloma",
          },
        });
      }

      const dateKey = scalar(payload, "created_time").slice(0, 10);
      await prisma.webhookLog.upsert({
        where: { id: `${JOB_PREFIX}-${repaired.leadgenId}` },
        create: {
          id: `${JOB_PREFIX}-${repaired.leadgenId}`,
          source: "manual_google_sheet_import",
          eventType: "meta_lead_sbc_gluteos",
          payload: JSON.stringify({
            leadgenId: repaired.leadgenId,
            phone: repaired.phone,
            dateKey,
          }),
          status: processedBody.whatsapp || processedBody.status || "processed",
          processedAt: new Date(),
        },
        update: {
          payload: JSON.stringify({
            leadgenId: repaired.leadgenId,
            phone: repaired.phone,
            dateKey,
          }),
          status: processedBody.whatsapp || processedBody.status || "processed",
          processedAt: new Date(),
        },
      });
    }

    return NextResponse.json(
      { ...processedBody, repaired: true },
      { status: processedResponse.status },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao reparar lead";
    return NextResponse.json(
      { ...processedBody, repaired: false, repairError: message },
      { status: 500 },
    );
  }
}
