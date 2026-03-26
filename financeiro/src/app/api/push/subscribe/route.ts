import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// POST — Subscribe to push notifications
export async function POST(request: NextRequest) {
    try {
        const { subscription, userId, userName } = await request.json();

        if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
            return NextResponse.json({ error: 'Subscription inválida' }, { status: 400 });
        }

        // Upsert: update if endpoint exists, create if not
        await prisma.pushSubscription.upsert({
            where: { endpoint: subscription.endpoint },
            update: {
                p256dh: subscription.keys.p256dh,
                auth: subscription.keys.auth,
                userId: userId || null,
                userName: userName || null,
            },
            create: {
                endpoint: subscription.endpoint,
                p256dh: subscription.keys.p256dh,
                auth: subscription.keys.auth,
                userId: userId || null,
                userName: userName || null,
            },
        });

        return NextResponse.json({ success: true });
    } catch (err) {
        console.error('Push subscribe error:', err);
        return NextResponse.json({ error: 'Erro ao salvar subscription' }, { status: 500 });
    }
}

// DELETE — Unsubscribe from push notifications
export async function DELETE(request: NextRequest) {
    try {
        const { endpoint } = await request.json();
        if (!endpoint) {
            return NextResponse.json({ error: 'Endpoint é obrigatório' }, { status: 400 });
        }

        await prisma.pushSubscription.deleteMany({ where: { endpoint } });
        return NextResponse.json({ success: true });
    } catch (err) {
        console.error('Push unsubscribe error:', err);
        return NextResponse.json({ error: 'Erro ao remover subscription' }, { status: 500 });
    }
}
