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
      // Parse DOCX using PizZip — handle Word's XML run splitting
      const PizZip = require('pizzip');
      const buffer = Buffer.from(fileData, 'base64');
      const zip = new PizZip(buffer);

      const docXml = zip.file('word/document.xml');
      if (docXml) {
        const xmlContent = docXml.asText();

        // Strategy 1: Extract text from each <w:p> (paragraph) element
        // This handles Word splitting {{tag}} across multiple <w:r> (run) elements
        const paragraphs = xmlContent.split(/<\/w:p>/);
        const textParts: string[] = [];

        for (const para of paragraphs) {
          // Extract all <w:t> content within this paragraph
          const tMatches = para.match(/<w:t[^>]*>([^<]*)<\/w:t>/g);
          if (tMatches) {
            const paraText = tMatches
              .map((m: string) => m.replace(/<w:t[^>]*>/, '').replace(/<\/w:t>/, ''))
              .join('');
            textParts.push(paraText);
          }
        }

        text = textParts.join('\n');
      }
    } else {
      // Parse PDF
      const pdfParse = require('pdf-parse');
      const buffer = Buffer.from(fileData, 'base64');
      const parsed = await pdfParse(buffer);
      text = parsed.text;
    }

    // Find all {{tag}} patterns — supports spaces, accents, hyphens in tag names
    const regex = /\{\{([^}]+)\}\}/g;
    const tagsFound = new Set<string>();
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      const tag = match[1].trim();
      if (tag) tagsFound.add(tag);
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
  // Auto-calculated end date (12 months from start)
  if (t.includes('fim') && t.includes('contrato')) return 'auto_end_date';
  // Day of month (1-31) for payment day
  if ((t.includes('dia') && t.includes('pagamento')) || t === 'dia_pagamento' || t === 'dia do pagamento') return 'day';
  if (t.includes('cpf')) return 'cpf';
  if (t.includes('cnpj')) return 'text';
  if (t.includes('data') || t.includes('nascimento') || t.includes('admissao') || t.includes('inicio') || t.includes('contratacao') || t.includes('dia_da_contratacao') || t.includes('dia da contratacao')) return 'date';
  if (t.includes('valor') || t.includes('salario') || t.includes('remuneracao') || t.includes('preco') || t.includes('honorario') || t.includes('quantia')) return 'currency';
  if (t.includes('telefone') || t.includes('celular') || t.includes('fone') || t.includes('whatsapp')) return 'phone';
  if (t.includes('email') || t.includes('e_mail') || t.includes('e-mail')) return 'email';
  if (t.includes('cep')) return 'cep';
  return 'text';
}
