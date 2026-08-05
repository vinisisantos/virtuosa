import { createHash, timingSafeEqual } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { processLead, type LeadData } from "@/lib/lead-processor";
import { phoneLookupKey } from "@/lib/phone";
import { sendAutomationText } from "@/lib/whatsapp/automation-sender";
import {
  createConversationForInstance,
  findConversationByPhone,
} from "@/lib/whatsapp/conversation-starter";
import { checkWhatsAppNumber } from "@/lib/whatsapp/number-check";

export const runtime = "nodejs";

const JOB_TOKEN_HASH = "042c61688183e42b4db14e899f7fb21b16700eb845d87380aa645dc83ca1de66";
const JOB_PREFIX = "manual-meta-gluteos-batch-2-2026-08-04";

const UNIT_CONFIG = {
  Osasco: {
    instanceId: "d1385a2c-e4e9-4822-8125-c693edf9ef3d",
    formId: "1325369796250945",
    eventType: "meta_lead_osasco_gluteos_batch_2",
    expectedMaximum: 9,
  },
  SCS: {
    instanceId: "bbb24b4e-ef6d-4b64-93e8-9998d0514c65",
    formId: "1363070175195046",
    eventType: "meta_lead_scs_gluteos_batch_2",
    expectedMaximum: 5,
  },
} as const;

type SupportedUnit = keyof typeof UNIT_CONFIG;

const ALLOWED_LEADS = new Map<string, SupportedUnit>([
  ["1543361946713530", "Osasco"],
  ["2048079212460723", "Osasco"],
  ["1768739197643750", "Osasco"],
  ["2038032140417072", "Osasco"],
  ["1036126869167409", "Osasco"],
  ["1069586102417273", "Osasco"],
  ["1783393916176095", "Osasco"],
  ["2238013973639601", "Osasco"],
  ["3334973263340479", "Osasco"],
  ["1650600787073210", "SCS"],
  ["1329844449232927", "SCS"],
  ["2151852538725965", "SCS"],
  ["1574509347533572", "SCS"],
  ["1046634007730382", "SCS"],
]);

const ALLOWED_CAMPAIGNS: Record<SupportedUnit, Set<string>> = {
  Osasco: new Set(["120249321672820006", "120251954010730494"]),
  SCS: new Set(["120249007079180109", "120249310857180006"]),
};

const ALLOWED_ADS: Record<SupportedUnit, Set<string>> = {
  Osasco: new Set(["120249321672810006", "120251954844540494"]),
  SCS: new Set(["120249007079190109", "120249007495800109", "120249321328780006"]),
};

type ImportPayload = {
  leadgen_id?: string;
  created_time?: string;
  ad_id?: string;
  ad_name?: string;
  campaign_id?: string;
  form_id?: string;
  form_name?: string;
  platform?: string;
  full_name?: string;
  phone_number?: string;
};

function normalizeText(value?: string | null) {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function campaignNameFor(payload: ImportPayload) {
  return normalizeText(payload.ad_name).includes("harmonizacao")
    ? "Harmonização de Glúteos"
    : "Glúteo Perfeito";
}

function receptionMessage(campaignName: string, name?: string) {
  const cleanName = (name || "").replace(/\*/g, "").trim();
  const greeting = cleanName ? `Olá, *${cleanName}*! 🌸` : "Olá! 🌸";
  const interest = campaignName === "Harmonização de Glúteos"
    ? "Harmonização de Glúteo"
    : "Glúteo Perfeito";

  return `${greeting}\n\nRecebemos seu cadastro com interesse em *${interest}*.\n\nEsta é uma mensagem automática para confirmar o recebimento da sua solicitação. O mais breve possível, nossa atendente entrará em contato para dar continuidade ao seu atendimento. 💗`;
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

function validatePayload(payload: ImportPayload) {
  const leadgenId = payload.leadgen_id?.trim() || "";
  const unit = ALLOWED_LEADS.get(leadgenId);
  if (!unit) return null;

  const config = UNIT_CONFIG[unit];
  const createdAt = new Date(payload.created_time || "");
  const phoneKey = phoneLookupKey(payload.phone_number);
  const normalizedAdName = normalizeText(payload.ad_name);
  const recognizedCampaign = normalizedAdName.includes("harmonizacao")
    || (normalizedAdName.includes("glute") && normalizedAdName.includes("perfeit"));

  if (
    payload.form_id !== config.formId
    || !ALLOWED_CAMPAIGNS[unit].has(payload.campaign_id || "")
    || !ALLOWED_ADS[unit].has(payload.ad_id || "")
    || !Number.isFinite(createdAt.getTime())
    || payload.created_time?.slice(0, 10) !== "2026-08-04"
    || !phoneKey
    || !recognizedCampaign
  ) return null;

  return { unit, config, leadgenId, createdAt, phoneKey };
}

async function targetInstance(unit: SupportedUnit) {
  const config = UNIT_CONFIG[unit];
  const instance = await prisma.whatsAppInstance.findFirst({
    where: { id: config.instanceId, unit, status: "connected" },
    select: {
      id: true,
      name: true,
      provider: true,
      userId: true,
      assignmentMode: true,
      defaultAssigneeId: true,
      user: { select: { name: true } },
      defaultAssignee: { select: { name: true } },
    },
  });
  if (!instance) throw new Error(`Instância de ${unit} indisponível`);
  return instance;
}

function conversationAssignee(instance: Awaited<ReturnType<typeof targetInstance>>) {
  if (instance.assignmentMode === "TEAM_QUEUE") {
    return { assignedTo: null, assignedToName: null };
  }
  if (instance.assignmentMode === "DEFAULT_ASSIGNEE" && instance.defaultAssigneeId) {
    return {
      assignedTo: instance.defaultAssigneeId,
      assignedToName: instance.defaultAssignee?.name || "Responsável da instância",
    };
  }
  return {
    assignedTo: instance.userId,
    assignedToName: instance.user?.name || null,
  };
}

async function isAlreadyPresent(payload: ImportPayload, unit: SupportedUnit, instanceId: string) {
  const phone = payload.phone_number || "";
  const phoneKey = phoneLookupKey(phone);
  if (!phoneKey) return true;

  const [conversation, metaLead, clients] = await Promise.all([
    findConversationByPhone({ phone, instanceIds: [instanceId] }),
    prisma.metaLead.findUnique({
      where: { leadgenId: payload.leadgen_id || "" },
      select: { id: true },
    }),
    prisma.client.findMany({
      where: {
        isActive: true,
        phone: { contains: phoneKey.slice(-8) },
        OR: [{ unit }, { originUnit: unit }],
      },
      select: { phone: true },
    }),
  ]);

  return Boolean(conversation)
    || Boolean(metaLead)
    || clients.some((client) => phoneLookupKey(client.phone) === phoneKey);
}

async function updateBatchLog(id: string, status: string, errorMessage?: string | null) {
  await prisma.webhookLog.update({
    where: { id },
    data: {
      status,
      errorMessage: errorMessage?.slice(0, 1000) || null,
      processedAt: status.startsWith("completed:") ? new Date() : undefined,
    },
  });
}

async function repairLeadRecords(params: {
  payload: ImportPayload;
  unit: SupportedUnit;
  createdAt: Date;
  clientId: string;
  conversationId?: string | null;
  instance: Awaited<ReturnType<typeof targetInstance>>;
}) {
  const { payload, unit, createdAt, clientId, conversationId, instance } = params;
  const campaignName = campaignNameFor(payload);
  const metaLead = await prisma.metaLead.findUnique({
    where: { leadgenId: payload.leadgen_id || "" },
    select: { id: true },
  });
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { tags: true, originUnit: true },
  });
  if (!metaLead || !client) throw new Error("Entidades do lead não foram persistidas");

  await prisma.$transaction(async (tx) => {
    await tx.client.update({
      where: { id: clientId },
      data: {
        campaignId: payload.ad_id,
        campaignName,
        campaignAttribution: "automatic_meta",
        originUnit: client.originUnit || unit,
        tags: addMetaAdsTag(client.tags),
        arrivedAt: createdAt,
        createdAt,
      },
    });
    await tx.metaLead.update({
      where: { id: metaLead.id },
      data: {
        formId: payload.form_id,
        formName: payload.form_name,
        adId: payload.ad_id,
        adName: payload.ad_name,
        campaignId: payload.campaign_id,
        campaignName,
        platform: payload.platform || "facebook",
        unit,
        createdAt,
      },
    });
    await tx.salesPipeline.updateMany({
      where: { clientId, stage: { notIn: ["fechado", "perdido"] } },
      data: {
        campaignIdSnapshot: payload.ad_id,
        campaignNameSnapshot: campaignName,
        campaignAttributionSnapshot: "automatic_meta",
        createdAt,
      },
    });

    if (conversationId) {
      const assignee = conversationAssignee(instance);
      await tx.whatsAppConversation.update({
        where: { id: conversationId },
        data: {
          createdAt,
          unreadCount: 1,
          assignedTo: assignee.assignedTo,
          assignedToName: assignee.assignedToName,
        },
      });
    }
  });
}

async function finalizeUnit(unit: SupportedUnit) {
  const config = UNIT_CONFIG[unit];
  const completed = await prisma.webhookLog.count({
    where: {
      id: { startsWith: `${JOB_PREFIX}-` },
      source: "manual_google_sheet_import",
      eventType: config.eventType,
      status: { startsWith: "completed:" },
    },
  });
  if (completed > config.expectedMaximum) {
    throw new Error(`Contagem de ${unit} excedeu o escopo auditado`);
  }

  const instance = await targetInstance(unit);
  if (completed > 0) {
    await prisma.crmLeadCountAdjustment.upsert({
      where: { adjustmentKey: `${JOB_PREFIX}-${unit.toLowerCase()}-2026-08-04` },
      create: {
        adjustmentKey: `${JOB_PREFIX}-${unit.toLowerCase()}-2026-08-04`,
        unit,
        date: new Date("2026-08-04T00:00:00.000Z"),
        count: completed,
        reason: `Leads ausentes do formulário Meta ${unit} importados na data original`,
        assignedTo: instance.defaultAssigneeId || instance.userId,
        createdBy: "Automação Meta",
      },
      update: {
        count: completed,
        assignedTo: instance.defaultAssigneeId || instance.userId,
        createdBy: "Automação Meta",
      },
    });
  }
  return { unit, completed, adjustment: completed };
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Lote manual não autorizado" }, { status: 401 });
  }

  const body = await request.json().catch(() => null) as (ImportPayload & { action?: string; unit?: string }) | null;
  if (body?.action === "finalize") {
    if (body.unit !== "Osasco" && body.unit !== "SCS") {
      return NextResponse.json({ error: "Unidade inválida" }, { status: 422 });
    }
    try {
      return NextResponse.json({ ok: true, ...(await finalizeUnit(body.unit)) });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao finalizar lote";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  if (!body) return NextResponse.json({ error: "Payload inválido" }, { status: 422 });
  const validated = validatePayload(body);
  if (!validated) return NextResponse.json({ error: "Lead fora do lote auditado" }, { status: 422 });

  const { unit, config, leadgenId, createdAt } = validated;
  const batchLogId = `${JOB_PREFIX}-${leadgenId}`;
  try {
    const instance = await targetInstance(unit);
    const existingLog = await prisma.webhookLog.findUnique({
      where: { id: batchLogId },
      select: { status: true },
    });
    if (existingLog?.status.startsWith("completed:")) {
      return NextResponse.json({ ok: true, duplicate: true, status: existingLog.status });
    }
    if (existingLog?.status === "sending" || existingLog?.status === "send_result_unknown") {
      return NextResponse.json({ error: "Resultado anterior de envio precisa de auditoria" }, { status: 409 });
    }
    if (!existingLog && await isAlreadyPresent(body, unit, instance.id)) {
      return NextResponse.json({ ok: true, skipped: "already_present" });
    }

    await prisma.webhookLog.upsert({
      where: { id: batchLogId },
      create: {
        id: batchLogId,
        source: "manual_google_sheet_import",
        eventType: config.eventType,
        payload: JSON.stringify({ leadgenId, unit, dateKey: "2026-08-04" }),
        status: "processing",
      },
      update: { status: "processing", errorMessage: null },
    });

    const lead: LeadData = {
      leadgenId,
      formId: body.form_id,
      formName: body.form_name,
      adId: body.ad_id,
      adName: body.ad_name,
      campaignId: body.campaign_id,
      campaignName: campaignNameFor(body),
      platform: body.platform || "facebook",
      name: body.full_name,
      phone: body.phone_number,
      rawData: JSON.stringify(body),
      unit,
    };
    const processed = await processLead(lead);
    if (!processed.success || !processed.clientId) {
      throw new Error(processed.error || "Falha ao persistir lead");
    }

    const checked = await checkWhatsAppNumber(instance, body.phone_number || "");
    if (!checked.exists) {
      await prisma.metaLead.update({
        where: { leadgenId },
        data: { status: "sem_whatsapp", processedAt: new Date() },
      });
      await repairLeadRecords({ payload: body, unit, createdAt, clientId: processed.clientId, instance });
      await updateBatchLog(batchLogId, "completed:number_not_found");
      return NextResponse.json({ ok: true, leadgenId, whatsapp: "number_not_found" });
    }

    const conversation = await createConversationForInstance({
      instanceId: instance.id,
      phone: checked.number,
      contactName: body.full_name,
      unit,
      lastKnownJid: checked.jid,
    });
    await updateBatchLog(batchLogId, "sending");
    const sent = await sendAutomationText({
      dbInstance: instance,
      conversationId: conversation.id,
      contactPhone: checked.number,
      message: receptionMessage(campaignNameFor(body), body.full_name),
      respondedByName: "Automação Meta",
    });

    await prisma.metaLead.update({
      where: { leadgenId },
      data: { status: "whatsapp_enviado", processedAt: new Date() },
    });
    await repairLeadRecords({
      payload: body,
      unit,
      createdAt,
      clientId: processed.clientId,
      conversationId: conversation.id,
      instance,
    });
    await updateBatchLog(batchLogId, "completed:sent");
    return NextResponse.json({
      ok: true,
      leadgenId,
      whatsapp: "sent",
      conversationId: conversation.id,
      messageId: sent.messageId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao processar lead";
    const existing = await prisma.webhookLog.findUnique({
      where: { id: batchLogId },
      select: { status: true },
    }).catch(() => null);
    const status = existing?.status === "sending" ? "send_result_unknown" : "error_before_send";
    await prisma.webhookLog.updateMany({
      where: { id: batchLogId },
      data: { status, errorMessage: message.slice(0, 1000), processedAt: new Date() },
    }).catch(() => undefined);
    return NextResponse.json({ error: message, status }, { status: status === "send_result_unknown" ? 409 : 500 });
  }
}
