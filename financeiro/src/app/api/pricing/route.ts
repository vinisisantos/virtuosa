import { NextResponse, NextRequest } from 'next/server';

import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const unit = req.nextUrl.searchParams.get('unit') || undefined;
    const id = req.nextUrl.searchParams.get('id');

    if (id) {
      const protocol = await prisma.pricingProtocol.findUnique({ where: { id } });
      return NextResponse.json(protocol);
    }

    const protocols = await prisma.pricingProtocol.findMany({
      where: unit ? { OR: [{ unit }, { unit: 'Todas' }] } : undefined,
      orderBy: { updatedAt: 'desc' },
    });
    return NextResponse.json({ protocols });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const protocol = await prisma.pricingProtocol.create({ data: body });
    return NextResponse.json(protocol);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, ...data } = body;
    if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });
    const protocol = await prisma.pricingProtocol.update({ where: { id }, data });
    return NextResponse.json(protocol);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });
    await prisma.pricingProtocol.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
