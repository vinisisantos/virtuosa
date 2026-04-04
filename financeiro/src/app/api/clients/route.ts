import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { getUserFromHeaders } from '@/lib/auth';

const prisma = new PrismaClient();

/* GET — List clients with search + pagination */
export async function GET(req: NextRequest) {
  const user = getUserFromHeaders(req);
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  try {
    const url = new URL(req.url);
    const search = url.searchParams.get('search') || '';
    const requestedUnit = url.searchParams.get('unit');
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '50');
    const id = url.searchParams.get('id');

    // Non-admins can only see their own unit
    const unitFilter = user.isAdmin ? requestedUnit : user.unit;

    // Direct ID lookup
    if (id) {
      const client = await prisma.client.findUnique({ where: { id } });
      if (!client) return NextResponse.json({ clients: [], total: 0, page: 1, limit: 1 });
      if (!user.isAdmin && client.unit !== user.unit) {
        return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
      }
      return NextResponse.json({ clients: [client], total: 1, page: 1, limit: 1 });
    }

    const includeInactive = url.searchParams.get('includeInactive') === 'true';
    const where: any = includeInactive ? {} : { isActive: true };
    if (unitFilter && unitFilter !== 'all') where.unit = unitFilter;
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { phone: { contains: search } },
        { email: { contains: search } },
        { cpf: { contains: search } },
      ];
    }

    const [clients, total] = await Promise.all([
      prisma.client.findMany({
        where,
        orderBy: { name: 'asc' },
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

/* POST — Create a new client */
export async function POST(req: NextRequest) {
  const user = getUserFromHeaders(req);
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  try {
    const body = await req.json();
    const { name, phone, email, cpf, rg, birthdate, gender, profissao, estadoCivil,
            unit, notes, tags, stage, source, followUpDate, packageValue,
            cep, estado, cidade, bairro, rua, numero, complemento, pais,
            quoteValue, quoteData, paymentMethod, installments } = body;

    if (!name) return NextResponse.json({ error: 'Nome obrigatório' }, { status: 400 });

    // Non-admins can only create clients in their own unit
    const clientUnit = user.isAdmin ? (unit || 'Barueri') : user.unit;

    const client = await prisma.client.create({
      data: {
        name, phone, email, cpf, rg, birthdate, gender, profissao, estadoCivil,
        unit: clientUnit, notes, tags,
        stage: stage || 'entrada',
        source: source || null,
        followUpDate: followUpDate ? new Date(followUpDate) : null,
        packageValue: packageValue ? parseFloat(packageValue) : null,
        quoteValue: quoteValue ? parseFloat(quoteValue) : 0,
        quoteData: quoteData || null,
        paymentMethod: paymentMethod || null,
        installments: installments ? parseInt(installments) : 1,
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
  const user = getUserFromHeaders(req);
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  try {
    const body = await req.json();
    const { id, ...data } = body;
    if (!id) return NextResponse.json({ error: 'ID obrigatório' }, { status: 400 });

    if (!user.isAdmin) {
      const existing = await prisma.client.findUnique({ where: { id }, select: { unit: true } });
      if (!existing || existing.unit !== user.unit) {
        return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
      }
      delete data.unit;
    }

    const client = await prisma.client.update({ where: { id }, data });
    return NextResponse.json({ success: true, client });
  } catch (err) {
    console.error('Clients PUT error:', err);
    return NextResponse.json({ error: 'Falha ao atualizar cliente' }, { status: 500 });
  }
}

/* DELETE — Soft delete (deactivate) — supports single id or batch ids[] */
export async function DELETE(req: NextRequest) {
  const user = getUserFromHeaders(req);
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  try {
    const body = await req.json();
    const ids: string[] = body.ids || (body.id ? [body.id] : []);
    if (ids.length === 0) return NextResponse.json({ error: 'ID(s) obrigatório(s)' }, { status: 400 });

    if (!user.isAdmin) {
      const existing = await prisma.client.findMany({ where: { id: { in: ids } }, select: { id: true, unit: true } });
      const unauthorized = existing.filter(c => c.unit !== user.unit);
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
