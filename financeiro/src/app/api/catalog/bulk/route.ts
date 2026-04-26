import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUnitGuard } from '@/lib/unit-guard';

/**
 * POST /api/catalog/bulk
 * Bulk-insert procedures into the ServiceCatalog.
 * Body: { procedures: [{name, price, category, unit, duration?}], skipExisting?: boolean }
 */
export async function POST(req: NextRequest) {
  const guard = requireUnitGuard(req);
  if (guard instanceof NextResponse) return guard;
  if (!guard.isAdmin) {
    return NextResponse.json({ error: 'Apenas administradores podem fazer inserção em massa.' }, { status: 403 });
  }

  const body = await req.json();
  const { procedures, skipExisting = true } = body;

  if (!Array.isArray(procedures) || procedures.length === 0) {
    return NextResponse.json({ error: 'Lista de procedimentos vazia.' }, { status: 400 });
  }

  let inserted = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const proc of procedures) {
    try {
      if (skipExisting) {
        // Check if a procedure with same name+unit already exists
        const existing = await prisma.serviceCatalog.findFirst({
          where: { name: proc.name, unit: proc.unit || 'Todas' },
        });
        if (existing) {
          skipped++;
          continue;
        }
      }

      await prisma.serviceCatalog.create({
        data: {
          name: proc.name,
          category: proc.category || 'Estética',
          price: proc.price || 0,
          duration: proc.duration || 60,
          unit: proc.unit || 'Todas',
          active: true,
          description: proc.description || null,
        },
      });
      inserted++;
    } catch (err: any) {
      errors.push(`${proc.name}: ${err.message}`);
    }
  }

  return NextResponse.json({
    ok: true,
    inserted,
    skipped,
    total: procedures.length,
    errors: errors.length > 0 ? errors : undefined,
  });
}
