import { createHash, timingSafeEqual } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { processLead, type LeadData } from "@/lib/lead-processor";
import { sendAutomationText } from "@/lib/whatsapp/automation-sender";
import {
  createConversationForInstance,
  findConversationByPhone,
} from "@/lib/whatsapp/conversation-starter";
import { getInstancePresentationSettings } from "@/lib/whatsapp/instance-presentation";
import { checkWhatsAppNumber } from "@/lib/whatsapp/number-check";

export const runtime = "nodejs";

const INTEGRATION_SOURCE = "zapier_meta_lead";
const SBC_TARGET_FORM_IDS = new Set([
  "13630715195046",
  "2475297602894575",
]);
const SCS_TARGET_FORM_ID = "1363070175195046";
const SBC_CAMPAIGN_IDS = new Set([
  "120247237187740077",
  "120249304650500006",
]);
const SCS_CAMPAIGN_IDS = new Set([
  "120249007079180109",
  "120249310857180006",
]);

type LeadRouting = {
  unit: "SBC" | "SCS";
  instanceDisplayName: string;
  campaignName: string;
  eventType: string;
  messageCampaignName: string;
};

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

const MAX_FIELD_DEPTH = 8;
const MAX_STRUCTURED_TEXT_LENGTH = 100_000;

function parseStructuredText(value: string): unknown | undefined {
  const text = value.trim();
  if (!text || text.length > MAX_STRUCTURED_TEXT_LENGTH) return undefined;

  if (text.startsWith("{") || text.startsWith("[")) {
    try {
      return JSON.parse(text);
    } catch {
      // Alguns conectores serializam como querystring ou linhas chave/valor.
    }
  }

  if (text.includes("=") && (text.includes("&") || text.includes("%"))) {
    const entries = [...new URLSearchParams(text).entries()];
    if (entries.length >= 2) return Object.fromEntries(entries);
  }

  const lineEntries = text
    .split(/\r?\n/)
    .map((line) => line.match(/^([^:\n]{1,80}):\s*(.+)$/))
    .filter((match): match is RegExpMatchArray => Boolean(match))
    .map((match) => [match[1].trim(), match[2].trim()] as const);

  const hasRecognizedLeadField = lineEntries.some(([key]) => [
    "form", "formname", "campaign", "campaignname", "ad", "adname", "leadid",
    "rawtelefone", "nomecompleto",
  ].includes(normalizeKey(key)));

  return hasRecognizedLeadField ? Object.fromEntries(lineEntries) : undefined;
}

function collectFields(
  value: unknown,
  fields = new Map<string, string>(),
  keys: string[] = [],
  depth = 0,
) {
  if (depth > MAX_FIELD_DEPTH || value === null || value === undefined) return { fields, keys };

  if (typeof value === "string") {
    const structured = parseStructuredText(value);
    if (structured !== undefined) collectFields(structured, fields, keys, depth + 1);
    return { fields, keys };
  }

  if (typeof value !== "object") return { fields, keys };

  if (!Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const fieldName = scalarValue(record.name) || scalarValue(record.key);
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
      const structured = parseStructuredText(scalar);
      if (structured !== undefined) collectFields(structured, fields, keys, depth + 1);
    } else if (nestedValue && typeof nestedValue === "object") {
      collectFields(nestedValue, fields, keys, depth + 1);
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
    formId: firstField(fields, ["form_id", "formid", "form"]),
    formName: firstField(fields, ["form_name", "formname", "formulário", "formulario"]),
    adId: firstField(fields, ["ad_id", "adid", "ad"]),
    adName: firstField(fields, ["ad_name", "adname", "anúncio", "anuncio"]),
    campaignId: firstField(fields, ["campaign_id", "campaignid", "campaign"]),
    campaignName: firstField(fields, ["campaign_name", "campaignname", "campanha"]),
    pageId: firstField(fields, ["page_id", "pageid", "page"]),
    createdTime: firstField(fields, ["created_time", "createdtime", "data_de_criacao", "datadecriacao"]),
    platform: firstField(fields, ["platform", "plataforma"]) || "facebook",
    name: firstField(fields, ["full_name", "fullname", "name", "nome_completo", "nome"]),
    email: firstField(fields, ["email", "email_address", "emailaddress"]),
    phone: firstField(fields, [
      "phone_number",
      "phonenumber",
      "phone",
      "telefone",
      "raw_telefone",
      "whatsapp",
    ]),
    rawData: JSON.stringify(payload),
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

function campaignFromAdName(adName?: string | null) {
  const normalized = normalizeText(adName);
  if (normalized.includes("harmonizacao")) {
    return {
      campaignName: "Harmonização de Glúteos",
      messageCampaignName: "Harmonização de Glúteo",
      eventTypeBase: "meta_lead_harmonizacao_gluteo",
    };
  }
  if (normalized.includes("glute") && normalized.includes("perfeit")) {
    return {
      campaignName: "Glúteo Perfeito",
      messageCampaignName: "Glúteo Perfeito",
      eventTypeBase: "meta_lead_gluteo_perfeito",
    };
  }
  return null;
}

function resolveLeadRouting(lead: ParsedMetaLead): LeadRouting | null {
  const scsCampaign = campaignFromAdName(lead.adName);
  const isScsLead = lead.formId === SCS_TARGET_FORM_ID
    || (lead.campaignId ? SCS_CAMPAIGN_IDS.has(lead.campaignId) : false);
  if (isScsLead && scsCampaign) {
    return {
      unit: "SCS",
      instanceDisplayName: "Thais Amorim Leads",
      campaignName: scsCampaign.campaignName,
      messageCampaignName: scsCampaign.messageCampaignName,
      eventType: `${scsCampaign.eventTypeBase}_scs`,
    };
  }

  // Um lead reconhecido como SCS nunca deve cair no fallback legado de SBC.
  if (isScsLead) return null;

  const sbcCampaign = campaignFromAdName(lead.adName);
  const isSbcLead = (lead.formId ? SBC_TARGET_FORM_IDS.has(lead.formId) : false)
    || (lead.campaignId ? SBC_CAMPAIGN_IDS.has(lead.campaignId) : false);
  if (isSbcLead && sbcCampaign) {
    return {
      unit: "SBC",
      instanceDisplayName: "Leads - Paloma",
      campaignName: sbcCampaign.campaignName,
      messageCampaignName: sbcCampaign.messageCampaignName,
      eventType: `${sbcCampaign.eventTypeBase}_sbc`,
    };
  }

  if (isSbcLead) return null;

  const signals = [lead.formName, lead.campaignName, lead.adName].map(normalizeText);
  if (signals.some((value) => value.includes("gluteo"))) {
    return {
      unit: "SBC",
      instanceDisplayName: "Leads - Paloma",
      campaignName: "Glúteo",
      messageCampaignName: "campanha de Glúteo da Clínica Virtuosa SBC",
      eventType: "meta_lead_gluteo_sbc",
    };
  }

  return null;
}

function formIdentificationSummary(lead: ParsedMetaLead) {
  const values = [
    lead.formId ? `formId=${lead.formId.slice(0, 80)}` : null,
    lead.formName ? `formName=${lead.formName.slice(0, 80)}` : null,
    lead.campaignName ? `campaign=${lead.campaignName.slice(0, 80)}` : null,
    lead.adName ? `ad=${lead.adName.slice(0, 80)}` : null,
  ].filter(Boolean);

  if (values.length > 0) return values.join(", ");

  const metadataKeys = lead.receivedKeys
    .filter((key) => /form|campaign|ad/i.test(key))
    .slice(0, 12);
  return metadataKeys.length > 0
    ? `campos=${metadataKeys.join(",")}`
    : "nenhum metadado de formulário/campanha detectado";
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

async function acquireEvent(lead: ParsedMetaLead, payload: unknown, eventType: string) {
  const id = eventLogId(lead.leadgenId);
  try {
    await prisma.webhookLog.create({
      data: {
        id,
        source: INTEGRATION_SOURCE,
        eventType,
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

function receptionMessage(routing: LeadRouting, name?: string) {
  const firstName = name?.trim().split(/\s+/)[0] || "";
  if (routing.campaignName === "Glúteo") {
    const greeting = firstName ? `Olá, ${firstName}! 😊` : "Olá! 😊";
    return `${greeting}\n\nRecebemos seu interesse na ${routing.messageCampaignName}. Em breve, nossa equipe dará continuidade ao seu atendimento por aqui.`;
  }

  const greeting = firstName ? `Olá, *${firstName}*! 🌸` : "Olá! 🌸";
  const preposition = routing.campaignName === "Glúteo Perfeito" ? "no" : "em";
  return `${greeting}\n\nRecebemos seu cadastro com interesse ${preposition} *${routing.messageCampaignName}*.\n\nEsta é uma mensagem automática para confirmar o recebimento da sua solicitação. O mais breve possível, nossa atendente entrará em contato para dar continuidade ao seu atendimento. 💗`;
}

async function findTargetInstance(routing: LeadRouting) {
  const { displayNames } = await getInstancePresentationSettings();
  const targetName = routing.instanceDisplayName.toLocaleLowerCase("pt-BR");
  const targetId = Object.entries(displayNames).find(
    ([, displayName]) => displayName.toLocaleLowerCase("pt-BR") === targetName,
  )?.[0];

  if (!targetId) return null;

  return prisma.whatsAppInstance.findFirst({
    where: {
      id: targetId,
      unit: routing.unit,
      status: "connected",
    },
    select: { id: true, name: true, provider: true },
  });
}

export async function GET() {
  const configured = Boolean(process.env.META_ZAPIER_WEBHOOK_SECRET?.trim());
  return NextResponse.json(
    {
      ok: configured,
      integration: "meta-zapier",
      routes: [
        { form: "GLÚTEO", unit: "SBC", campaigns: ["Glúteo Perfeito", "Harmonização de Glúteos"] },
        { form: "GLÚTEO", unit: "SCS", campaigns: ["Glúteo Perfeito", "Harmonização de Glúteos"] },
      ],
    },
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
  const routing = resolveLeadRouting(lead);
  if (!routing) {
    return NextResponse.json(
      {
        error: `O evento não pertence ao formulário GLÚTEO. Detectado: ${formIdentificationSummary(lead)}`,
      },
      { status: 422 },
    );
  }

  lead.unit = routing.unit;
  lead.campaignName = routing.campaignName;
  const event = await acquireEvent(lead, payload, routing.eventType);
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

    const instance = await findTargetInstance(routing);
    if (!instance) {
      await updateEvent(
        event.id,
        "processed_without_instance",
        `Instância ${routing.instanceDisplayName} desconectada ou ausente`,
      );
      return NextResponse.json({
        ok: true,
        clientId: processed.clientId,
        pipelineId: processed.pipelineId,
        whatsapp: "skipped_instance_unavailable",
      });
    }

    const existingConversation = await findConversationByPhone({
      phone: lead.phone,
      instanceIds: [instance.id],
    });
    if (existingConversation) {
      await prisma.metaLead.update({
        where: { leadgenId: lead.leadgenId },
        data: { status: "conversa_existente", processedAt: new Date() },
      });
      await updateEvent(event.id, "processed_without_existing_conversation");
      return NextResponse.json({
        ok: true,
        clientId: processed.clientId,
        pipelineId: processed.pipelineId,
        conversationId: existingConversation.id,
        whatsapp: "skipped_existing_conversation",
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
      unit: routing.unit,
      lastKnownJid: checked.jid,
    });

    // Depois deste ponto não há retry automático: uma falha de rede pode ocorrer
    // após o provedor já ter aceitado a mensagem e reenviar criaria duplicidade.
    await updateEvent(event.id, "sending");
    const sent = await sendAutomationText({
      dbInstance: instance,
      conversationId: conversation.id,
      contactPhone: checked.number,
      message: receptionMessage(routing, lead.name),
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
