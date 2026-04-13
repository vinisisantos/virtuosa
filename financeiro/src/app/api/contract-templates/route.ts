import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { getUserFromHeaders } from '@/lib/auth';

const prisma = new PrismaClient();

export async function GET(req: NextRequest) {
  const user = getUserFromHeaders(req);
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');

  if (id) {
    const template = await prisma.contractTemplate.findUnique({ where: { id } });
    if (!template) return NextResponse.json(null);
    return NextResponse.json(template);
  }

  // Get all templates. They are considered global unless specifically restricted,
  // but for now we fetch all so any computer can see them.
  try {
    const templates = await prisma.contractTemplate.findMany({
      orderBy: { createdAt: 'desc' }
    });
    return NextResponse.json(templates.map((t: any) => ({
      ...t,
      content: t.htmlContent, // Map for frontend backward compatibility
    })));
  } catch (error) {
    console.error('Error fetching templates:', error);
    return NextResponse.json({ error: 'Erro ao buscar modelos' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const user = getUserFromHeaders(req);
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  try {
    const body = await req.json();
    
    // Support batch migration
    if (Array.isArray(body)) {
      let created = 0;
      for (const item of body) {
        // If it already exists by name, skip to prevent duplicates during migration
        const existing = await prisma.contractTemplate.findFirst({ where: { name: item.name } });
        if (!existing) {
          await prisma.contractTemplate.create({
            data: {
              name: item.name || 'Novo Modelo',
              type: item.type || 'Contrato de prestação de serviço',
              htmlContent: item.content !== undefined ? item.content : (item.htmlContent || ''),
              fileName: item.fileName || null,
              fileBase64: item.fileBase64 || null,
              backgroundPdf: item.backgroundPdf || null,
              backgroundPdfName: item.backgroundPdfName || null,
              active: item.active !== undefined ? item.active : true,
              isGlobal: true,
            }
          });
          created++;
        }
      }
      return NextResponse.json({ success: true, migrated: created });
    }

    // Single creation/update
    const { id, name, type, content, fileName, fileBase64, backgroundPdf, backgroundPdfName, active } = body;
    const htmlContent = content !== undefined ? content : body.htmlContent; // Support both frontends

    // Check if updating
    if (id) {
      // Find directly if it exists, although we can just upsert or update
      // Prisma uses string for id but sometimes frontend sends int
      const existing = await prisma.contractTemplate.findFirst({ where: { id: String(id) } });
      if (existing) {
         const updated = await prisma.contractTemplate.update({
           where: { id: existing.id },
           data: {
             name,
             type,
             htmlContent,
             fileName: fileName !== undefined ? fileName : undefined,
             fileBase64: fileBase64 !== undefined ? fileBase64 : undefined,
             backgroundPdf: backgroundPdf !== undefined ? backgroundPdf : undefined,
             backgroundPdfName: backgroundPdfName !== undefined ? backgroundPdfName : undefined,
             active: active !== undefined ? active : undefined,
           }
         });
         return NextResponse.json(updated);
      }
    }

    // Create new
    const template = await prisma.contractTemplate.create({
      data: {
        id: id ? String(id) : undefined, // use provided id if available
        name: name || 'Novo Modelo',
        type: type || 'Contrato de prestação de serviço',
        htmlContent: htmlContent || '',
        fileName: fileName || null,
        fileBase64: fileBase64 || null,
        backgroundPdf: backgroundPdf || null,
        backgroundPdfName: backgroundPdfName || null,
        active: active !== undefined ? active : true,
        isGlobal: true,
      },
    });

    return NextResponse.json(template);
  } catch (error) {
    console.error('Error saving template:', error);
    return NextResponse.json({ error: 'Erro ao salvar modelo' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const user = getUserFromHeaders(req);
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) return NextResponse.json({ error: 'ID is required' }, { status: 400 });

    await prisma.contractTemplate.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting template:', error);
    return NextResponse.json({ error: 'Erro ao deletar modelo' }, { status: 500 });
  }
}
