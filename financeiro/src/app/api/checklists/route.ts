import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Default checklists per procedure type
const DEFAULT_CHECKLISTS: Record<string, string[]> = {
  'Depilação Laser': ['Verificar tipo de pele', 'Limpar área', 'Aplicar gel protetor', 'Configurar potência laser', 'Óculos de proteção', 'Termo assinado'],
  'Limpeza de Pele': ['Remover maquiagem', 'Preparar vapor', 'Materiais de extração', 'Máscaras disponíveis', 'Protetor solar pós'],
  'Botox': ['Verificar alergias', 'Marcar pontos de aplicação', 'Preparar toxina', 'Gelo local', 'Termo de consentimento assinado'],
  'Preenchimento': ['Verificar alergias', 'Fotos antes', 'Anestésico tópico', 'Preparar ácido hialurônico', 'Termo assinado', 'Gelo'],
  'Peeling': ['Avaliar sensibilidade', 'Limpar pele', 'Preparar ácido', 'Neutralizador disponível', 'Protetor solar', 'Orientações pós'],
  'Microagulhamento': ['Verificar contraindicações', 'Anestésico tópico 40min antes', 'Limpar dermaroller', 'Sérum para aplicação', 'Fotos antes'],
  'Massagem': ['Verificar contraindicações', 'Aquecer óleos', 'Preparar maca', 'Toalhas aquecidas', 'Música ambiente'],
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const procedimento = searchParams.get('procedimento');

  if (procedimento) {
    const checklist = await prisma.serviceChecklist.findUnique({ where: { procedimento } });
    if (checklist) return NextResponse.json(checklist);
    // Return default if exists
    const defaultItems = DEFAULT_CHECKLISTS[procedimento];
    if (defaultItems) return NextResponse.json({ id: null, procedimento, items: JSON.stringify(defaultItems) });
    return NextResponse.json({ id: null, procedimento, items: '[]' });
  }

  const all = await prisma.serviceChecklist.findMany({ orderBy: { procedimento: 'asc' } });
  // Merge with defaults
  const existing = new Set(all.map(c => c.procedimento));
  const defaults = Object.entries(DEFAULT_CHECKLISTS).filter(([k]) => !existing.has(k)).map(([k, v]) => ({ id: null, procedimento: k, items: JSON.stringify(v) }));

  return NextResponse.json({ checklists: [...all, ...defaults] });
}

export async function POST(req: Request) {
  const body = await req.json();
  const checklist = await prisma.serviceChecklist.upsert({
    where: { procedimento: body.procedimento },
    update: { items: JSON.stringify(body.items) },
    create: { procedimento: body.procedimento, items: JSON.stringify(body.items) },
  });
  return NextResponse.json(checklist);
}
