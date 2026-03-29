import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/* GET — List clients with search + pagination */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const search = url.searchParams.get('search') || '';
    const unit = url.searchParams.get('unit');
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '50');

    const where: any = { isActive: true };
    if (unit && unit !== 'all') where.unit = unit;
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
  try {
    const body = await req.json();
    const { name, phone, email, cpf, rg, birthdate, gender, profissao, estadoCivil,
            unit, notes, tags, stage, source, followUpDate, packageValue,
            cep, estado, cidade, bairro, rua, numero, complemento, pais,
            quoteValue, quoteData, paymentMethod, installments } = body;

    if (!name) return NextResponse.json({ error: 'Nome obrigatório' }, { status: 400 });

    const client = await prisma.client.create({
      data: {
        name, phone, email, cpf, rg, birthdate, gender, profissao, estadoCivil,
        unit: unit || 'Barueri', notes, tags,
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
  try {
    const body = await req.json();
    const { id, ...data } = body;
    if (!id) return NextResponse.json({ error: 'ID obrigatório' }, { status: 400 });

    const client = await prisma.client.update({ where: { id }, data });
    return NextResponse.json({ success: true, client });
  } catch (err) {
    console.error('Clients PUT error:', err);
    return NextResponse.json({ error: 'Falha ao atualizar cliente' }, { status: 500 });
  }
}

/* DELETE — Soft delete (deactivate) */
export async function DELETE(req: NextRequest) {
  try {
    const { id } = await req.json();
    if (!id) return NextResponse.json({ error: 'ID obrigatório' }, { status: 400 });

    await prisma.client.update({ where: { id }, data: { isActive: false } });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Clients DELETE error:', err);
    return NextResponse.json({ error: 'Falha ao remover cliente' }, { status: 500 });
  }
}
