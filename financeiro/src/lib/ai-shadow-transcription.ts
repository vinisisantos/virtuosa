import { prisma } from "@/lib/db";

const TRANSCRIPTION_PROVIDER = "gemini";
const TRANSCRIPTION_MODEL = "gemini-2.5-flash";
const AUDIO_TYPES = ["audio", "ptt", "audioMessage", "pttMessage"];

function parseDataUri(value: string) {
  const match = value.match(/^data:([^;,]+)(?:;[^,]*)?;base64,(.*)$/);
  if (!match) return null;
  return { mimeType: match[1], base64: match[2] };
}

async function mediaToInlineData(mediaUrl: string) {
  const dataUri = parseDataUri(mediaUrl);
  if (dataUri) return dataUri;

  const res = await fetch(mediaUrl, { signal: AbortSignal.timeout(25000) });
  if (!res.ok) throw new Error(`Falha ao baixar áudio (${res.status})`);
  const contentType = res.headers.get("content-type") || "audio/ogg";
  const buffer = Buffer.from(await res.arrayBuffer());
  return { mimeType: contentType, base64: buffer.toString("base64") };
}

function geminiText(data: any) {
  return data?.candidates?.flatMap((candidate: any) => candidate?.content?.parts || []).map((part: any) => part.text || "").join("").trim() || "";
}

export async function transcribeWhatsAppAudioMessage(messageId: string) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY nao configurada");

  const message = await prisma.whatsAppMessage.findUnique({
    where: { id: messageId },
    select: { id: true, type: true, mediaUrl: true },
  });
  if (!message) throw new Error("Mensagem não encontrada");
  if (!AUDIO_TYPES.includes(message.type) || !message.mediaUrl) {
    throw new Error("Mensagem não é áudio ou não possui mídia");
  }

  await prisma.whatsAppMessageTranscript.upsert({
    where: { whatsAppMessageId: message.id },
    update: { status: "pending", error: null, provider: TRANSCRIPTION_PROVIDER, model: TRANSCRIPTION_MODEL },
    create: {
      whatsAppMessageId: message.id,
      status: "pending",
      provider: TRANSCRIPTION_PROVIDER,
      model: TRANSCRIPTION_MODEL,
    },
  });

  try {
    const inlineData = await mediaToInlineData(message.mediaUrl);
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${TRANSCRIPTION_MODEL}:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              {
                text: "Transcreva este áudio de WhatsApp em português do Brasil. Retorne somente a transcrição, sem comentários. Se estiver inaudível, retorne [inaudível].",
              },
              {
                inline_data: {
                  mime_type: inlineData.mimeType,
                  data: inlineData.base64,
                },
              },
            ],
          },
        ],
        generationConfig: { temperature: 0, maxOutputTokens: 1800 },
      }),
      signal: AbortSignal.timeout(45000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error?.message || `Gemini transcrição ${res.status}`);
    const transcript = geminiText(data);
    if (!transcript) throw new Error("Gemini retornou transcrição vazia");

    await prisma.whatsAppMessageTranscript.update({
      where: { whatsAppMessageId: message.id },
      data: {
        status: "completed",
        transcript,
        language: "pt-BR",
        error: null,
        provider: TRANSCRIPTION_PROVIDER,
        model: TRANSCRIPTION_MODEL,
      },
    });
    return { messageId: message.id, status: "completed", transcript };
  } catch (error: any) {
    await prisma.whatsAppMessageTranscript.update({
      where: { whatsAppMessageId: message.id },
      data: {
        status: "error",
        error: error?.message || String(error),
        provider: TRANSCRIPTION_PROVIDER,
        model: TRANSCRIPTION_MODEL,
      },
    });
    throw error;
  }
}

export async function processPendingAudioTranscriptions(params: { unit?: string; limit?: number } = {}) {
  const unit = params.unit || "Osasco";
  const limit = Math.max(1, Math.min(20, Number(params.limit || 8)));
  const messages = await prisma.whatsAppMessage.findMany({
    where: {
      type: { in: AUDIO_TYPES },
      mediaUrl: { not: null },
      conversation: { instance: { unit, capturesLeads: true } },
      OR: [
        { transcripts: { none: {} } },
        { transcripts: { some: { status: { in: ["pending", "error"] } } } },
      ],
    },
    select: { id: true },
    orderBy: { timestamp: "desc" },
    take: limit,
  });

  const results = [];
  for (const message of messages) {
    try {
      const result = await transcribeWhatsAppAudioMessage(message.id);
      results.push(result);
    } catch (error: any) {
      results.push({ messageId: message.id, status: "error", error: error?.message || String(error) });
    }
  }

  return {
    scanned: messages.length,
    completed: results.filter((item) => item.status === "completed").length,
    failed: results.filter((item) => item.status === "error").length,
    results,
  };
}
