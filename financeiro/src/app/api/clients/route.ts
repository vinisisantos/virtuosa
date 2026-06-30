import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUnitGuard, UnitAccessDeniedError, unitAccessDeniedResponse } from '@/lib/unit-guard';
import { parseDateTimeRange } from '@/lib/date-filter';

/* GET — List clients with search + pagination */
export async function GET(req: NextRequest) {
  const guard = requireUnitGuard(req, { requestedUnit: new URL(req.url).searchParams.get('unit') });
  if (guard instanceof NextResponse) return guard;

  try {
    const url = new URL(req.url);
    const search = url.searchParams.get('search') || '';
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '50');
    const id = url.searchParams.get('id');

    // Direct ID lookup
    if (id) {
      const client = await prisma.client.findUnique({ where: { id } });
      if (!client) return NextResponse.json({ clients: [], total: 0, page: 1, limit: 1 });
      // UNIT GUARD: Validate record belongs to user's unit
      if (!guard.isAdmin && client.unit !== guard.userUnit) {
        return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
      }
      return NextResponse.json({ clients: [client], total: 1, page: 1, limit: 1 });
    }

    const includeInactive = url.searchParams.get('includeInactive') === 'true';
    const startDateStr = url.searchParams.get('startDate');
    const endDateStr = url.searchParams.get('endDate');
    const stageParam = url.searchParams.get('stage');
    const sourceParam = url.searchParams.get('source');
    const orderByParam = url.searchParams.get('orderBy') || 'name';
    const userId = url.searchParams.get('userId');

    const where: any = includeInactive ? {} : { isActive: true };
    // UNIT GUARD: Always filter by JWT unit (admins see their unit by default, can override with ?unit=)
    if (guard.unitFilter) where.unit = guard.unitFilter;
    if (userId) where.userId = userId;
    
    const stageValues = stageParam?.split(',').map(s => s.trim()).filter(Boolean) || [];
    const sourceValues = sourceParam?.split(',').map(s => s.trim()).filter(Boolean) || [];
    if (stageValues.length) where.stage = { in: stageValues };
    if (sourceValues.length) where.source = { in: sourceValues };

    const dateRange = parseDateTimeRange(url.searchParams);
    if (dateRange || startDateStr || endDateStr) {
      const finalRange: any = dateRange || {};
      if (!dateRange && startDateStr) finalRange.gte = new Date(startDateStr);
      if (!dateRange && endDateStr) {
        const endDate = new Date(endDateStr);
        endDate.setHours(23, 59, 59, 999);
        finalRange.lte = endDate;
      }
      where.OR = [
        { arrivedAt: finalRange },
        { arrivedAt: null, createdAt: finalRange },
      ];
    }

    if (search) {
      const searchWhere = [
        { name: { contains: search } },
        { phone: { contains: search } },
        { email: { contains: search } },
        { cpf: { contains: search } },
      ];
      if (where.OR) {
        where.AND = [{ OR: where.OR }, { OR: searchWhere }];
        delete where.OR;
      } else {
        where.OR = searchWhere;
      }
    }

    const [clients, total] = await Promise.all([
      prisma.client.findMany({
        where,
        orderBy: orderByParam === 'createdAt_desc'
          ? { createdAt: 'desc' }
          : orderByParam === 'createdAt_asc'
            ? { createdAt: 'asc' }
            : { name: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.client.count({ where }),
    ]);

    return NextResponse.json({ clients, total, page, limit });
  } catch (err) {
    console.error('Clients GET error:', err);
    return NextResponse.json({ error: 'Falha ao carregar clientes' }, { status: 500 });
  }
}

/* POST — Create a new client (with duplicate detection) */
export async function POST(req: NextRequest) {
  const guard = requireUnitGuard(req);
  if (guard instanceof NextResponse) return guard;

  try {
    const body = await req.json();
    const { name, phone, email, cpf, rg, birthdate, gender, profissao, estadoCivil,
            notes, tags, stage, source, followUpDate, packageValue,
            cep, estado, cidade, bairro, rua, numero, complemento, pais,
            quoteValue, quoteData, paymentMethod, installments, closingDate,
            campaignName, arrivedAt,
            force } = body;

    if (!name) return NextResponse.json({ error: 'Nome obrigatório' }, { status: 400 });

    // ── Duplicate detection (skip if force=true) ──
    if (!force) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const dupConditions: any[] = [];
      const cleanCpf = (cpf || '').replace(/\D/g, '');
      const cleanPhone = (phone || '').replace(/\D/g, '');
      const cleanEmail = (email || '').toLowerCase().trim();

      if (cleanCpf && cleanCpf.length >= 11) dupConditions.push({ cpf: { contains: cleanCpf } });
      if (cleanPhone && cleanPhone.length >= 10) dupConditions.push({ phone: { contains: cleanPhone } });
      if (cleanEmail && cleanEmail.length >= 5) dupConditions.push({ email: cleanEmail });

      if (dupConditions.length > 0) {
        const candidates = await prisma.client.findMany({
          where: { isActive: true, OR: dupConditions },
          select: { id: true, name: true, phone: true, email: true, cpf: true, unit: true, birthdate: true, gender: true },
          take: 5,
        });

        if (candidates.length > 0) {
          return NextResponse.json({
            duplicate: true,
            message: 'Paciente com dados semelhantes já existe no sistema.',
            candidates,
          }, { status: 409 });
        }
      }
    }

    const client = await prisma.client.create({
      data: {
        name, phone, email, cpf, rg, birthdate, gender, profissao, estadoCivil,
        unit: guard.createUnit(body.unit), // UNIT GUARD: Force JWT unit
        notes, tags,
        stage: stage || 'entrada',
        source: source || null,
        campaignName: campaignName || null,
        arrivedAt: arrivedAt ? new Date(arrivedAt) : new Date(),
        followUpDate: followUpDate ? new Date(followUpDate) : null,
        packageValue: packageValue ? parseFloat(String(packageValue)) : null,
        quoteValue: quoteValue ? parseFloat(quoteValue) : 0,
        quoteData: quoteData || null,
        paymentMethod: paymentMethod || null,
        installments: installments ? parseInt(installments) : 1,
        closingDate: closingDate || null,
        cep, estado, cidade, bairro, rua, numero, complemento, pais: pais || 'Brasil',
      },
    });

    return NextResponse.json({ success: true, client });
  } catch (err) {
    console.error('Clients POST error:', err);
    return NextResponse.json({ error: 'Falha ao criar cliente' }, { status: 500 });
  }
}

/* PUT — Update client */
export async function PUT(req: NextRequest) {
  const guard = requireUnitGuard(req);
  if (guard instanceof NextResponse) return guard;

  try {
    const body = await req.json();
    const { id, ...data } = body;
    if (!id) return NextResponse.json({ error: 'ID obrigatório' }, { status: 400 });

    // UNIT GUARD: Validate record belongs to user's unit
    const existing = await prisma.client.findUnique({ where: { id }, select: { unit: true } });
    if (!existing) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 });
    try { guard.enforceUnit(existing.unit); } catch (e) {
      if (e instanceof UnitAccessDeniedError) return unitAccessDeniedResponse();
      throw e;
    }
    if (!guard.isAdmin) delete data.unit;

    // ── Sanitize Date & Number fields ──────────────────────────────────────
    // JSON transit sends these as strings or null; Prisma DateTime fields
    // need actual Date objects or null, never empty strings.
    const safeDate = (v: unknown) => {
      if (!v || v === '') return null;
      const d = new Date(v as string);
      return isNaN(d.getTime()) ? null : d;
    };
    if ('arrivedAt'    in data) data.arrivedAt    = safeDate(data.arrivedAt);
    if ('followUpDate' in data) data.followUpDate = safeDate(data.followUpDate);
    if ('birthdate'    in data) data.birthdate    = data.birthdate || null;
    if ('packageValue' in data) {
      const pv = data.packageValue;
      data.packageValue = (pv !== null && pv !== '' && !isNaN(Number(pv))) ? Number(pv) : null;
    }
    // Remove fields that Prisma doesn't accept on update (non-schema fields)
    delete data.createdAt;
    delete data.updatedAt;
    // ────────────────────────────────────────────────────────────────────────

    const client = await prisma.client.update({ where: { id }, data });
    return NextResponse.json({ success: true, client });
  } catch (err) {
    console.error('Clients PUT error:', err);
    return NextResponse.json({ error: 'Falha ao atualizar cliente' }, { status: 500 });
  }
}

/* DELETE — Soft delete (deactivate) — supports single id or batch ids[] */
export async function DELETE(req: NextRequest) {
  const guard = requireUnitGuard(req);
  if (guard instanceof NextResponse) return guard;

  try {
    const body = await req.json();
    const ids: string[] = body.ids || (body.id ? [body.id] : []);
    if (ids.length === 0) return NextResponse.json({ error: 'ID(s) obrigatório(s)' }, { status: 400 });

    // UNIT GUARD: Validate all records belong to user's unit
    if (!guard.isAdmin) {
      const existing = await prisma.client.findMany({ where: { id: { in: ids } }, select: { id: true, unit: true } });
      const unauthorized = existing.filter(c => c.unit !== guard.userUnit);
      if (unauthorized.length > 0) {
        return NextResponse.json({ error: 'Acesso negado a alguns pacientes' }, { status: 403 });
      }
    }

    await prisma.client.updateMany({ where: { id: { in: ids } }, data: { isActive: false } });
    return NextResponse.json({ success: true, count: ids.length });
  } catch (err) {
    console.error('Clients DELETE error:', err);
    return NextResponse.json({ error: 'Falha ao remover cliente(s)' }, { status: 500 });
  }
}
