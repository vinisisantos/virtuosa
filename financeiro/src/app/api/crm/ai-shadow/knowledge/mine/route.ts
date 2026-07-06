import { NextRequest, NextResponse } from "next/server";
import { getUserFromHeaders } from "@/lib/auth";
import { prisma } from "@/lib/db";

const KEYWORDS = [
  "procedimento",
  "protocolo",
  "tratamento",
  "avaliação",
  "como funciona",
  "realizado",
  "gordura",
  "abdômen",
  "abdomen",
  "barriga",
  "botox",
  "criolipólise",
  "criolipolise",
  "emagrecimento",
  "flancos",
];

function requireAdmin(req: NextRequest) {
  const user = getUserFromHeaders(req);
  if (!user) return { allowed: false, response: NextResponse.json({ error: "Não autorizado" }, { status: 401 }) };
  if (user.isAdmin) return { allowed: true, user };
  return { allowed: false, response: NextResponse.json({ error: "Apenas administradores podem minerar a base IA" }, { status: 403 }) };
}

function normalize(text: string) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function looksLikeProcedureExplanation(text: string) {
  const normalized = normalize(text);
  return text.trim().length >= 80 && KEYWORDS.some((keyword) => normalized.includes(normalize(keyword)));
}

function compact(text: string, max = 900) {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}...` : clean;
}

function inferProcedureName(text: string) {
  const normalized = normalize(text);
  if (normalized.includes("barriga") || normalized.includes("abdomen") || normalized.includes("gordura")) return "Barriga Trincada";
  if (normalized.includes("botox")) return "Botox";
  if (normalized.includes("criolipolise")) return "Criolipólise";
  if (normalized.includes("emagrecimento")) return "Emagrecimento";
  return "Procedimento";
}

function suggestionFromMessage(params: {
  unit: string;
  sourceConversationId: string;
  sourceMessageId: string;
  sourceType: string;
  text: string;
}) {
  const procedureName = inferProcedureName(params.text);
  const excerpt = compact(params.text, 1000);
  return {
    unit: params.unit,
    sourceConversationId: params.sourceConversationId,
    sourceMessageId: params.sourceMessageId,
    sourceType: params.sourceType,
    procedureName,
    title: `${procedureName} · ${params.sourceType === "audio_transcript" ? "áudio transcrito" : "mensagem da consultora"}`,
    excerpt,
    suggestedContent: {
      name: procedureName,
      howItWorks: excerpt,
      indications: "",
      whatToSay: excerpt,
      whatNotToSay: "Não prometer resultado, não confirmar agendamento e não orientar questões médicas sem avaliação.",
      priceRange: "",
    },
  };
}

export async function POST(req: NextRequest) {
  try {
    const auth = requireAdmin(req);
    if (!auth.allowed) return auth.response;
    const body = await req.json().catch(() => ({}));
    const unit = body.unit === "SCS" || body.unit === "SBC" ? body.unit : "Osasco";
    const limit = Math.max(1, Math.min(50, Number(body.limit || 20)));

    const existing = await prisma.aiKnowledgeSuggestion.findMany({
      where: { unit, sourceMessageId: { not: null } },
      select: { sourceMessageId: true },
      take: 5000,
    });
    const existingSourceIds = new Set(existing.map((item) => item.sourceMessageId).filter(Boolean));

    const [textMessages, transcripts] = await Promise.all([
      prisma.whatsAppMessage.findMany({
        where: {
          fromMe: true,
          body: { not: "" },
          respondedByName: { not: "Automação" },
          conversation: { instance: { unit, capturesLeads: true } },
        },
        select: { id: true, conversationId: true, body: true },
        orderBy: { timestamp: "desc" },
        take: limit * 4,
      }),
      prisma.whatsAppMessageTranscript.findMany({
        where: {
          status: "completed",
          transcript: { not: null },
          message: {
            fromMe: true,
            conversation: { instance: { unit, capturesLeads: true } },
          },
        },
        select: {
          transcript: true,
          message: { select: { id: true, conversationId: true } },
        },
        orderBy: { updatedAt: "desc" },
        take: limit * 4,
      }),
    ]);

    const suggestions = [];
    for (const message of textMessages) {
      if (suggestions.length >= limit) break;
      if (existingSourceIds.has(message.id) || !looksLikeProcedureExplanation(message.body)) continue;
      existingSourceIds.add(message.id);
      suggestions.push(suggestionFromMessage({
        unit,
        sourceConversationId: message.conversationId,
        sourceMessageId: message.id,
        sourceType: "consultant_message",
        text: message.body,
      }));
    }

    for (const item of transcripts) {
      if (suggestions.length >= limit) break;
      const text = item.transcript || "";
      if (existingSourceIds.has(item.message.id) || !looksLikeProcedureExplanation(text)) continue;
      existingSourceIds.add(item.message.id);
      suggestions.push(suggestionFromMessage({
        unit,
        sourceConversationId: item.message.conversationId,
        sourceMessageId: item.message.id,
        sourceType: "audio_transcript",
        text,
      }));
    }

    if (suggestions.length > 0) {
      await prisma.aiKnowledgeSuggestion.createMany({ data: suggestions });
    }

    return NextResponse.json({ created: suggestions.length, suggestions });
  } catch (error: any) {
    console.error("[POST /api/crm/ai-shadow/knowledge/mine]", error);
    return NextResponse.json({ error: "Falha ao minerar sugestões", details: error?.message }, { status: 500 });
  }
}
