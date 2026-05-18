import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const unit = searchParams.get('unit') || 'all';

    let employees;
    if (unit === 'all') {
      employees = await prisma.smartEmployee.findMany({ orderBy: { nome: 'asc' } });
    } else {
      employees = await prisma.smartEmployee.findMany({ where: { unidade: unit }, orderBy: { nome: 'asc' } });
    }

    return NextResponse.json(employees);
  } catch (error) {
    console.error('Error fetching smart employees:', error);
    return NextResponse.json({ error: 'Failed to fetch employees' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const data = await req.json();
    const employee = await prisma.smartEmployee.create({
      data: {
        nome: data.nome,
        unidade: data.unidade,
        cargo: data.cargo,
        tipo: data.tipo,
        salarioBase: data.salarioBase,
        temInsalubridade: data.temInsalubridade,
        temRT: data.temRT,
        status: data.status,
      },
    });
    return NextResponse.json(employee);
  } catch (error) {
    console.error('Error creating smart employee:', error);
    return NextResponse.json({ error: 'Failed to create employee' }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const data = await req.json();
    const { id, ...updateData } = data;
    const employee = await prisma.smartEmployee.update({
      where: { id },
      data: updateData,
    });
    return NextResponse.json(employee);
  } catch (error) {
    console.error('Error updating smart employee:', error);
    return NextResponse.json({ error: 'Failed to update employee' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'ID is required' }, { status: 400 });

    await prisma.smartEmployee.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting smart employee:', error);
    return NextResponse.json({ error: 'Failed to delete employee' }, { status: 500 });
  }
}
