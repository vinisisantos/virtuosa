import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { callAIVision, cleanJsonResponse, friendlyError } from '@/lib/ai';

const SYSTEM_PROMPT = `Você é um assistente de extração de dados. O usuário vai enviar um arquivo (imagem ou PDF) e pedir para você extrair informações específicas.

REGRAS:
1. Responda SEMPRE em JSON válido
2. Use o formato: { "items": [...], "summary": "..." }
3. Cada item deve ser um objeto com as chaves relevantes ao pedido do usuário
4. Se não conseguir extrair algum campo, use null
5. O "summary" deve ser um resumo curto do que foi encontrado
6. Responda em português (pt-BR)
7. NÃO inclua markdown, code blocks, ou qualquer texto fora do JSON`;

/* ── POST: Re-extract with a different prompt ── */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { uploadId, fileBase64, fileType, prompt } = body;

    if (!uploadId || !fileBase64 || !prompt) {
      return NextResponse.json({ error: 'uploadId, arquivo e prompt são obrigatórios.' }, { status: 400 });
    }

    await prisma.insumoUpload.update({
      where: { id: uploadId },
      data: { prompt, status: 'processing', extractedData: null, errorMessage: null },
    });

    const base64Data = fileBase64.includes(',') ? fileBase64.split(',')[1] : fileBase64;
    const mimeType = (fileType === 'image/jpg' ? 'image/jpeg' : fileType) || 'image/jpeg';

    const { text, provider } = await callAIVision(
      `Extraia do arquivo enviado: ${prompt}`,
      SYSTEM_PROMPT, base64Data, mimeType,
    );

    const cleanJson = cleanJsonResponse(text);
    JSON.parse(cleanJson); // validate

    await prisma.insumoUpload.update({
      where: { id: uploadId },
      data: { extractedData: cleanJson, status: 'completed', prompt },
    });

    return NextResponse.json({ extractedData: cleanJson, status: 'completed', provider });
  } catch (err: any) {
    return NextResponse.json({ error: friendlyError(err.message || '') }, { status: 500 });
  }
}
