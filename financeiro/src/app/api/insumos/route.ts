import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { callAIVision, cleanJsonResponse, friendlyError } from '@/lib/ai';
import { requireUnitGuard } from '@/lib/unit-guard';

const ACCEPTED_TYPES = [
  'application/pdf',
  'image/png', 'image/jpeg', 'image/jpg', 'image/webp',
  'image/heic', 'image/heif', 'image/bmp', 'image/gif',
];

const MAX_FILE_SIZE = 20 * 1024 * 1024;

const SYSTEM_PROMPT = `Você é um assistente de extração de dados. O usuário vai enviar um arquivo (imagem ou PDF) e pedir para você extrair informações específicas.

REGRAS:
1. Responda SEMPRE em JSON válido
2. Use o formato: { "items": [...], "summary": "..." }
3. Cada item deve ser um objeto com as chaves relevantes ao pedido do usuário
4. Se não conseguir extrair algum campo, use null
5. O "summary" deve ser um resumo curto do que foi encontrado
6. Responda em português (pt-BR)
7. NÃO inclua markdown, code blocks, ou qualquer texto fora do JSON`;

/* GET: List uploads */
export async function GET(req: NextRequest) {
  const guard = requireUnitGuard(req, { requestedUnit: new URL(req.url).searchParams.get('unit') });
  if (guard instanceof NextResponse) return guard;

  try {
    const where: any = {};
    // UNIT GUARD: Filter by JWT unit
    if (guard.unitFilter) where.unit = guard.unitFilter;
    const uploads = await prisma.insumoUpload.findMany({ where, orderBy: { createdAt: 'desc' }, take: 50 });
    return NextResponse.json(uploads);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/* POST: Upload + AI Extract */
export async function POST(req: NextRequest) {
  const guard = requireUnitGuard(req);
  if (guard instanceof NextResponse) return guard;

  try {
    const body = await req.json();
    const { fileBase64, fileName, fileType, fileSize, prompt, userId, userName } = body;

    if (!fileBase64 || !fileName || !fileType || !prompt) {
      return NextResponse.json({ error: 'Arquivo e prompt são obrigatórios.' }, { status: 400 });
    }
    if (!ACCEPTED_TYPES.includes(fileType)) {
      return NextResponse.json({ error: `Tipo não suportado: ${fileType}` }, { status: 400 });
    }
    if (fileSize > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'Arquivo muito grande. Máximo 20MB.' }, { status: 400 });
    }

    const upload = await prisma.insumoUpload.create({
      data: { fileName, fileType, fileSize: fileSize || 0, prompt, unit: guard.createUnit(), userId, userName, status: 'processing' },
    });

    try {
      const base64Data = fileBase64.includes(',') ? fileBase64.split(',')[1] : fileBase64;
      const mimeType = fileType === 'image/jpg' ? 'image/jpeg' : fileType;

      const { text, provider } = await callAIVision(
        `Extraia do arquivo enviado: ${prompt}`,
        SYSTEM_PROMPT, base64Data, mimeType,
      );

      const cleanJson = cleanJsonResponse(text);
      JSON.parse(cleanJson);

      await prisma.insumoUpload.update({ where: { id: upload.id }, data: { extractedData: cleanJson, status: 'completed' } });
      return NextResponse.json({ id: upload.id, extractedData: cleanJson, status: 'completed', provider });
    } catch (aiError: any) {
      const friendly = friendlyError(aiError.message || '');
      await prisma.insumoUpload.update({ where: { id: upload.id }, data: { status: 'error', errorMessage: friendly } });
      return NextResponse.json({ id: upload.id, error: friendly, status: 'error' }, { status: 500 });
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/* DELETE: Remove upload */
export async function DELETE(req: NextRequest) {
  const guard = requireUnitGuard(req);
  if (guard instanceof NextResponse) return guard;

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'ID obrigatório.' }, { status: 400 });

    const existing = await prisma.insumoUpload.findUnique({ where: { id } });
    if (existing) {
      try { guard.enforceUnit(existing.unit); } catch { return NextResponse.json({ error: 'Acesso negado' }, { status: 403 }); }
    }

    await prisma.insumoUpload.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
