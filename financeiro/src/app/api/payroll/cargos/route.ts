import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET() {
  try {
    const entries = await prisma.payrollEntry.findMany({
      select: { cargo: true },
      where: { cargo: { not: null } },
      distinct: ['cargo']
    });

    const cargos = entries
      .map(e => e.cargo)
      .filter(Boolean)
      .sort((a, b) => a!.localeCompare(b!));

    return NextResponse.json({ success: true, cargos });
  } catch (error) {
    console.error('Error fetching cargos:', error);
    return NextResponse.json({ success: false, cargos: [] }, { status: 500 });
  }
}
