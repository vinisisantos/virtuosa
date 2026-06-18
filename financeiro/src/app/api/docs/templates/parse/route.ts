import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { fileData, fileType } = await req.json();

    if (!fileData) {
      return NextResponse.json({ error: 'fileData (base64) é obrigatório' }, { status: 400 });
    }

    const detectedType = fileType || 'pdf';
    let text = '';

    if (detectedType === 'docx') {
      // Parse DOCX using PizZip + raw XML extraction
      const PizZip = require('pizzip');
      const buffer = Buffer.from(fileData, 'base64');
      const zip = new PizZip(buffer);

      // Extract text from document.xml
      const docXml = zip.file('word/document.xml');
      if (docXml) {
        const xmlContent = docXml.asText();
        // Remove XML tags to get plain text, preserving {{tags}}
        text = xmlContent.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
      }
    } else {
      // Parse PDF
      const pdfParse = require('pdf-parse');
      const buffer = Buffer.from(fileData, 'base64');
      const parsed = await pdfParse(buffer);
      text = parsed.text;
    }

    // Find all {{tag}} patterns
    const regex = /\{\{(\w+)\}\}/g;
    const tagsFound = new Set<string>();
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      tagsFound.add(match[1]);
    }

    // Convert to field definitions
    const fields = Array.from(tagsFound).map(tag => ({
      tag,
      label: humanize(tag),
      type: guessType(tag),
      required: true,
    }));

    return NextResponse.json({ fields, totalTags: fields.length, fileType: detectedType });
  } catch (error) {
    console.error('Parse error:', error);
    return NextResponse.json({ error: 'Erro ao analisar o arquivo' }, { status: 500 });
  }
}

function humanize(tag: string): string {
  return tag
    .replace(/_/g, ' ')
    .replace(/\b\w/g, l => l.toUpperCase());
}

function guessType(tag: string): string {
  const t = tag.toLowerCase();
  if (t.includes('cpf')) return 'cpf';
  if (t.includes('data') || t.includes('nascimento') || t.includes('admissao') || t.includes('inicio') || t.includes('contratacao')) return 'date';
  if (t.includes('valor') || t.includes('salario') || t.includes('remuneracao') || t.includes('preco')) return 'currency';
  if (t.includes('telefone') || t.includes('celular') || t.includes('fone') || t.includes('whatsapp')) return 'phone';
  if (t.includes('email') || t.includes('e_mail')) return 'email';
  if (t.includes('cep')) return 'cep';
  return 'text';
}
