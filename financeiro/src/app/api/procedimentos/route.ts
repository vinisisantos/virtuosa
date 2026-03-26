import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET() {
  try {
    const procedures = await prisma.procedimentoTermo.findMany({
      orderBy: { name: 'asc' },
    });
    return NextResponse.json(procedures.map((p: { name: string }) => p.name));
  } catch (error) {
    console.error('Failed to fetch procedures:', error);
    return NextResponse.json([], { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { name } = await request.json();
    if (!name?.trim()) {
      return NextResponse.json({ error: 'Name required' }, { status: 400 });
    }
    // Upsert - create if not exists
    await prisma.procedimentoTermo.upsert({
      where: { name: name.trim() },
      update: {},
      create: { name: name.trim() },
    });
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    console.error('Failed to save procedure:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
