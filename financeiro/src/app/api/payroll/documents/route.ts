import { NextResponse } from 'next/server';

import { prisma } from "@/lib/db";

// Limit payload size globally in Next.js config if needed, here we use ~5MB max size per file

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const unit = searchParams.get('unit');
    const employeeName = searchParams.get('employeeName');

    if (!unit || !employeeName) {
      return NextResponse.json({ error: 'Missing unit or employeeName' }, { status: 400 });
    }

    const docs = await prisma.employeeDocument.findMany({
      where: { unit, employeeName },
      orderBy: { createdAt: 'desc' }
    });

    return NextResponse.json({ success: true, documents: docs });
  } catch (error) {
    console.error('Error fetching employee docs:', error);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const data = await req.json();
    const { unit, employeeName, fileName, fileType, fileData, fileSize } = data;

    if (!unit || !employeeName || !fileName || !fileData) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const doc = await prisma.employeeDocument.create({
      data: {
        unit,
        employeeName,
        fileName,
        fileType,
        fileSize,
        fileData
      }
    });

    return NextResponse.json({ success: true, document: doc });
  } catch (error) {
    console.error('Error uploading employee doc:', error);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Missing id' }, { status: 400 });
    }

    await prisma.employeeDocument.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting employee doc:', error);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}
