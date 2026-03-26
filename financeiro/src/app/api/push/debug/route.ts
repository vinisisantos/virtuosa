import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// GET — Debug push setup
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const test = searchParams.get('test');

        const subscriptions = await prisma.pushSubscription.findMany({
            select: {
                id: true, userId: true, userName: true, endpoint: true, createdAt: true,
                p256dh: true, auth: true,
            },
        });

        const vapidPublic = process.env.VAPID_PUBLIC_KEY || '';
        const vapidPrivate = process.env.VAPID_PRIVATE_KEY || '';
        const vapidEmail = process.env.VAPID_EMAIL || 'admin@virtuosa.com';

        const summary: any = {
            totalSubscriptions: subscriptions.length,
            subscriptions: subscriptions.map(s => ({
                id: s.id, userId: s.userId, userName: s.userName,
                endpoint: s.endpoint?.substring(0, 60) + '...',
                p256dhLength: s.p256dh?.length,
                authLength: s.auth?.length,
                createdAt: s.createdAt,
            })),
            envCheck: {
                vapidPublicLength: vapidPublic.length,
                vapidPublicValue: vapidPublic,
                vapidPrivateLength: vapidPrivate.length,
                vapidEmail,
            },
        };

        if (test === 'true' && subscriptions.length > 0) {
            try {
                const webPush = (await import('web-push')).default;

                // Test setVapidDetails
                try {
                    webPush.setVapidDetails(`mailto:${vapidEmail}`, vapidPublic, vapidPrivate);
                    summary.setVapidResult = 'OK';
                } catch (e: any) {
                    summary.setVapidResult = e.message;
                }

                // Direct send test
                const sub = subscriptions[0];
                try {
                    const result = await webPush.sendNotification(
                        {
                            endpoint: sub.endpoint,
                            keys: { p256dh: sub.p256dh, auth: sub.auth },
                        },
                        JSON.stringify({
                            title: '🔔 Teste',
                            body: 'Notificações funcionando!',
                            icon: '/logo-virtuosa.png',
                            url: '/pedidos',
                        }),
                        {
                            vapidDetails: {
                                subject: `mailto:${vapidEmail}`,
                                publicKey: vapidPublic,
                                privateKey: vapidPrivate,
                            },
                        }
                    );
                    summary.sendResult = { status: result.statusCode, body: result.body };
                } catch (e: any) {
                    summary.sendResult = {
                        error: e.message,
                        statusCode: e.statusCode,
                        body: e.body,
                        headers: e.headers,
                    };
                }
            } catch (e: any) {
                summary.importError = e.message;
            }
        }

        return NextResponse.json(summary);
    } catch (err: any) {
        return NextResponse.json({ error: err.message, stack: err.stack?.substring(0, 300) }, { status: 500 });
    }
}
