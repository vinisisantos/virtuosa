import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { id, hasFgts } = body;

        if (!id || typeof hasFgts !== 'boolean') {
            return NextResponse.json({ success: false, error: 'Invalid data' }, { status: 400 });
        }

        const entry = await prisma.payrollEntry.update({
            where: { id },
            data: { hasFgts }
        });

        return NextResponse.json({ success: true, entry });
    } catch (error) {
        console.error('Error toggling FGTS:', error);
        return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
    }
}
