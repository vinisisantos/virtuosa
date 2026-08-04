import { createHash, timingSafeEqual } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { processLead, type LeadData } from "@/lib/lead-processor";
import { sendAutomationText } from "@/lib/whatsapp/automation-sender";
import { createConversationForInstance } from "@/lib/whatsapp/conversation-starter";
import { getInstancePresentationSettings } from "@/lib/whatsapp/instance-presentation";
import { checkWhatsAppNumber } from "@/lib/whatsapp/number-check";

export const runtime = "nodejs";

const INTEGRATION_SOURCE = "zapier_meta_lead";
const TARGET_UNIT = "SBC";
const TARGET_INSTANCE_NAME = "Leads - Paloma";
const CANONICAL_CAMPAIGN_NAME = "Glúteo";

type ParsedMetaLead = LeadData & {
  createdTime?: string;
  receivedKeys: string[];
};

function normalizeKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toLowerCase();
}

function normalizeText(value?: string | null) {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function scalarValue(value: unknown): string | undefined {
  if (typeof value === "string") return value.trim() || undefined;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value) && value.length === 1) return scalarValue(value[0]);
  return undefined;
}

function collectFields(value: unknown, fields = new Map<string, string>(), keys: string[] = []) {
  if (!value || typeof value !== "object") return { fields, keys };

  if (!Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const fieldName = scalarValue(record.name);
    const fieldValue = scalarValue(record.values) || scalarValue(record.value);
    if (fieldName && fieldValue) {
      const normalizedFieldName = normalizeKey(fieldName);
      if (normalizedFieldName && !fields.has(normalizedFieldName)) {
        fields.set(normalizedFieldName, fieldValue);
      }
    }
  }

  for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
    keys.push(key);
    const scalar = scalarValue(nestedValue);
    if (scalar !== undefined) {
      const normalized = normalizeKey(key);
      if (normalized && !fields.has(normalized)) fields.set(normalized, scalar);
    } else if (nestedValue && typeof nestedValue === "object") {
      collectFields(nestedValue, fields, keys);
    }
  }

  return { fields, keys };
}

function firstField(fields: Map<string, string>, aliases: string[]) {
  for (const alias of aliases) {
    const value = fields.get(normalizeKey(alias));
    if (value) return value;
  }
  return undefined;
}

function parseMetaLead(payload: unknown): ParsedMetaLead {
  const { fields, keys } = collectFields(payload);
  return {
    leadgenId: firstField(fields, ["leadgen_id", "lead_id", "leadid", "id"]) || "",
    formId: firstField(fields, ["form_id", "formid"]),
    formName: firstField(fields, ["form_name", "formname", "formulário", "formulario"]),
    adId: firstField(fields, ["ad_id", "adid"]),
    adName: firstField(fields, ["ad_name", "adname", "anúncio", "anuncio"]),
    campaignId: firstField(fields, ["campaign_id", "campaignid"]),
    campaignName: firstField(fields, ["campaign_name", "campaignname", "campanha"]),
    pageId: firstField(fields, ["page_id", "pageid"]),
    createdTime: firstField(fields, ["created_time", "createdtime", "data_de_criacao", "datadecriacao"]),
    platform: firstField(fields, ["platform", "plataforma"]) || "facebook",
    name: firstField(fields, ["full_name", "fullname", "name", "nome_completo", "nome"]),
    email: firstField(fields, ["email", "email_address", "emailaddress"]),
    phone: firstField(fields, ["phone_number", "phonenumber", "phone", "telefone", "whatsapp"]),
    rawData: JSON.stringify(payload),
    unit: TARGET_UNIT,
    receivedKeys: [...new Set(keys)].slice(0, 80),
  };
}

function fallbackLeadgenId(lead: ParsedMetaLead, payload: unknown) {
  const identity = [
    lead.createdTime,
    lead.phone,
    lead.email,
    lead.formId,
    lead.formName,
    lead.campaignId,
    lead.adId,
  ].filter(Boolean).join("|") || JSON.stringify(payload);

  return `zapier-fallback-${createHash("sha256").update(identity).digest("hex")}`;
}

function isGluteoForm(lead: ParsedMetaLead) {
  const signals = [lead.formName, lead.campaignName, lead.adName].map(normalizeText);
  return signals.some((value) => value.includes("gluteo"));
}

function isAuthorized(request: NextRequest) {
  const expected = process.env.META_ZAPIER_WEBHOOK_SECRET?.trim();
  if (!expected) return false;

  const authorization = request.headers.get("authorization") || "";
  const headerSecret = request.headers.get("x-zapier-secret") || "";
  const received = authorization.replace(/^Bearer\s+/i, "").trim() || headerSecret.trim();
  if (!received) return false;

  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(received);
  return expectedBuffer.length === receivedBuffer.length
    && timingSafeEqual(expectedBuffer, receivedBuffer);
}

async function readPayload(request: NextRequest) {
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/json")) return request.json();

  if (contentType.includes("application/x-www-form-urlencoded")) {
    return Object.fromEntries((await request.formData()).entries());
  }

  const text = await request.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return Object.fromEntries(new URLSearchParams(text));
  }
}

function eventLogId(leadgenId: string) {
  const digest = createHash("sha256").update(leadgenId).digest("hex");
  return `zapier-meta-${digest}`;
}

function isUniqueConstraintError(error: unknown) {
  return !!error && typeof error === "object" && "code" in error
    && (error as { code?: string }).code === "P2002";
}

async function acquireEvent(lead: ParsedMetaLead, payload: unknown) {
  const id = eventLogId(lead.leadgenId);
  try {
    await prisma.webhookLog.create({
      data: {
        id,
        source: INTEGRATION_SOURCE,
        eventType: "meta_lead_gluteo_sbc",
        payload: JSON.stringify(payload),
        status: "processing",
      },
    });
    return { id, acquired: true, status: "processing" };
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;
  }

  const existing = await prisma.webhookLog.findUnique({ where: { id } });
  if (!existing) return { id, acquired: false, status: "unknown" };

  if (existing.status === "error_before_send") {
    const recovered = await prisma.webhookLog.updateMany({
      where: { id, status: "error_before_send" },
      data: {
        status: "processing",
        errorMessage: null,
        retryCount: { increment: 1 },
      },
    });
    if (recovered.count === 1) return { id, acquired: true, status: "processing" };
  }

  return { id, acquired: false, status: existing.status };
}

async function updateEvent(id: string, status: string, errorMessage?: string | null) {
  await prisma.webhookLog.update({
    where: { id },
    data: {
      status,
      errorMessage: errorMessage?.slice(0, 1000) || null,
      processedAt: status === "processed" || status.startsWith("processed_without")
        ? new Date()
        : undefined,
    },
  });
}

function receptionMessage(name?: string) {
  const firstName = name?.trim().split(/\s+/)[0] || "";
  const greeting = firstName ? `Olá, ${firstName}! 😊` : "Olá! 😊";
  return `${greeting}\n\nRecebemos seu interesse na campanha de Glúteo da Clínica Virtuosa SBC. Em breve, nossa equipe dará continuidade ao seu atendimento por aqui.`;
}

async function findTargetInstance() {
  const { displayNames } = await getInstancePresentationSettings();
  const targetName = TARGET_INSTANCE_NAME.toLocaleLowerCase("pt-BR");
  const targetId = Object.entries(displayNames).find(
    ([, displayName]) => displayName.toLocaleLowerCase("pt-BR") === targetName,
  )?.[0];

  if (!targetId) return null;

  return prisma.whatsAppInstance.findFirst({
    where: {
      id: targetId,
      unit: TARGET_UNIT,
      status: "connected",
    },
    select: { id: true, name: true, provider: true },
  });
}

export async function GET() {
  const configured = Boolean(process.env.META_ZAPIER_WEBHOOK_SECRET?.trim());
  return NextResponse.json(
    { ok: configured, integration: "meta-zapier", form: "GLÚTEO", unit: TARGET_UNIT },
    { status: configured ? 200 : 503 },
  );
}

export async function POST(request: NextRequest) {
  if (!process.env.META_ZAPIER_WEBHOOK_SECRET?.trim()) {
    return NextResponse.json({ error: "Integração não configurada" }, { status: 503 });
  }
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await readPayload(request);
  } catch {
    return NextResponse.json({ error: "Payload inválido" }, { status: 400 });
  }

  const lead = parseMetaLead(payload);
  if (!lead.leadgenId) {
    lead.leadgenId = fallbackLeadgenId(lead, payload);
  }
  if (!isGluteoForm(lead)) {
    return NextResponse.json(
      { error: "O evento não pertence ao formulário GLÚTEO", formName: lead.formName || null },
      { status: 422 },
    );
  }

  lead.campaignName = CANONICAL_CAMPAIGN_NAME;
  const event = await acquireEvent(lead, payload);
  if (!event.acquired) {
    return NextResponse.json({
      ok: true,
      duplicate: true,
      status: event.status,
      leadgenId: lead.leadgenId,
    });
  }

  try {
    const processed = await processLead(lead);
    if (!processed.success) throw new Error(processed.error || "Falha ao processar lead");

    if (!lead.phone) {
      await updateEvent(event.id, "processed_without_phone", "Lead salvo sem telefone");
      return NextResponse.json({
        ok: true,
        clientId: processed.clientId,
        pipelineId: processed.pipelineId,
        whatsapp: "skipped_without_phone",
      });
    }

    const instance = await findTargetInstance();
    if (!instance) {
      await updateEvent(event.id, "processed_without_instance", "Instância Leads - Paloma desconectada ou ausente");
      return NextResponse.json({
        ok: true,
        clientId: processed.clientId,
        pipelineId: processed.pipelineId,
        whatsapp: "skipped_instance_unavailable",
      });
    }

    const checked = await checkWhatsAppNumber(instance, lead.phone);
    if (!checked.exists) {
      await updateEvent(event.id, "processed_without_whatsapp", "Telefone não possui WhatsApp");
      return NextResponse.json({
        ok: true,
        clientId: processed.clientId,
        pipelineId: processed.pipelineId,
        whatsapp: "number_not_found",
      });
    }

    const conversation = await createConversationForInstance({
      instanceId: instance.id,
      phone: checked.number,
      contactName: lead.name,
      unit: TARGET_UNIT,
      lastKnownJid: checked.jid,
    });

    // Depois deste ponto não há retry automático: uma falha de rede pode ocorrer
    // após o provedor já ter aceitado a mensagem e reenviar criaria duplicidade.
    await updateEvent(event.id, "sending");
    const sent = await sendAutomationText({
      dbInstance: instance,
      conversationId: conversation.id,
      contactPhone: checked.number,
      message: receptionMessage(lead.name),
      respondedByName: "Automação Meta",
    });

    await prisma.metaLead.update({
      where: { leadgenId: lead.leadgenId },
      data: { status: "whatsapp_enviado", processedAt: new Date() },
    });
    await updateEvent(event.id, "processed");

    return NextResponse.json({
      ok: true,
      leadgenId: lead.leadgenId,
      clientId: processed.clientId,
      pipelineId: processed.pipelineId,
      conversationId: conversation.id,
      messageId: sent.messageId,
      whatsapp: "sent",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido";
    const current = await prisma.webhookLog.findUnique({
      where: { id: event.id },
      select: { status: true },
    });
    const status = current?.status === "sending" ? "send_result_unknown" : "error_before_send";
    await updateEvent(event.id, status, message).catch(() => undefined);

    if (status === "send_result_unknown") {
      return NextResponse.json({ ok: false, status, error: message }, { status: 200 });
    }
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
