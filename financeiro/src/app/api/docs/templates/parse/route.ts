import { NextResponse } from 'next/server';

function humanize(tag: string): string {
  return tag
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

function guessType(tag: string): string {
  const lower = tag.toLowerCase();

  if (lower.includes('cpf')) return 'cpf';
  if (lower.includes('data') || lower.includes('nascimento')) return 'date';
  if (lower.includes('valor') || lower.includes('salario')) return 'currency';
  if (lower.includes('telefone') || lower.includes('celular')) return 'phone';
  if (lower.includes('email')) return 'email';
  if (lower.includes('cep')) return 'cep';

  return 'text';
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { pdfData } = body;

    if (!pdfData) {
      return NextResponse.json(
        { error: 'pdfData (base64) é obrigatório' },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(pdfData, 'base64');

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pdfParse = require('pdf-parse');
    const parsed = await pdfParse(buffer);
    const text = parsed.text;

    const regex = /\{\{(\w+)\}\}/g;
    const tagsFound = new Set<string>();
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      tagsFound.add(match[1]);
    }

    const fields = Array.from(tagsFound).map((tag) => ({
      tag,
      label: humanize(tag),
      type: guessType(tag),
      required: true,
    }));

    return NextResponse.json({
      fields,
      totalTags: tagsFound.size,
    });
  } catch (error) {
    console.error('Error parsing PDF:', error);
    return NextResponse.json(
      { error: 'Erro ao processar PDF' },
      { status: 500 }
    );
  }
}
