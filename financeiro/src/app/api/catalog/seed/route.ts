import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

/**
 * POST /api/catalog/seed
 * Temporary endpoint to seed procedures - protected by secret token
 * Body: { token, procedures: [{name, price, category, unit}], skipExisting?: boolean }
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { token, procedures, skipExisting = true } = body;

  // Simple secret protection
  if (token !== 'virtuosa-seed-2026') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!Array.isArray(procedures) || procedures.length === 0) {
    return NextResponse.json({ error: 'Empty list' }, { status: 400 });
  }

  let inserted = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const proc of procedures) {
    try {
      if (skipExisting) {
        const existing = await prisma.serviceCatalog.findFirst({
          where: { name: proc.name, unit: proc.unit || 'Todas' },
        });
        if (existing) { skipped++; continue; }
      }
      await prisma.serviceCatalog.create({
        data: {
          name: proc.name,
          category: proc.category || 'Estética',
          price: proc.price || 0,
          duration: proc.duration || 60,
          unit: proc.unit || 'Todas',
          active: true,
          description: null,
        },
      });
      inserted++;
    } catch (err: any) {
      errors.push(`${proc.name}: ${err.message}`);
    }
  }

  return NextResponse.json({ ok: true, inserted, skipped, total: procedures.length, errors: errors.length > 0 ? errors : undefined });
}
