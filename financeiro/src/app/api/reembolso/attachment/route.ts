import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

/* ── GET: Fetch attachment file data by ID ── */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'ID obrigatório' }, { status: 400 });

    const attachment = await prisma.reembolsoAttachment.findUnique({ where: { id } });
    if (!attachment) return NextResponse.json({ error: 'Anexo não encontrado' }, { status: 404 });

    return NextResponse.json({
      id: attachment.id,
      fileName: attachment.fileName,
      fileType: attachment.fileType,
      fileSize: attachment.fileSize,
      fileData: attachment.fileData,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Erro ao buscar anexo' }, { status: 500 });
  }
}
