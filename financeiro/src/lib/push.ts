import { prisma } from '@/lib/db';

/**
 * Convert URL-safe Base64 to Buffer (for web-push vapidDetails)
 */
function urlBase64ToBuffer(base64String: string): Buffer {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    return Buffer.from(base64, 'base64');
}

/**
 * Send push notification to all subscribed users (except the one who triggered the action)
 */
export async function sendPushToAll(
    title: string,
    body: string,
    excludeUserId?: string
) {
    try {
        const webPush = (await import('web-push')).default;

        const vapidPublic = (process.env.VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '').trim();
        const vapidPrivate = (process.env.VAPID_PRIVATE_KEY || '').trim();
        const vapidEmail = (process.env.VAPID_EMAIL || 'admin@virtuosa.com').trim();

        if (!vapidPublic || !vapidPrivate) {
            return { sent: 0, failed: 0, error: 'VAPID keys not configured' };
        }

        let subscriptions;
        if (excludeUserId) {
            subscriptions = await prisma.pushSubscription.findMany({
                where: { NOT: { userId: excludeUserId } },
            });
        } else {
            subscriptions = await prisma.pushSubscription.findMany();
        }

        if (subscriptions.length === 0) {
            return { sent: 0, failed: 0, error: 'No subscriptions found' };
        }

        const payload = JSON.stringify({ title, body, icon: '/logo-virtuosa.png', url: '/pedidos' });
        const errors: string[] = [];

        const vapidOptions = {
            subject: `mailto:${vapidEmail}`,
            publicKey: vapidPublic,
            privateKey: vapidPrivate,
        };

        const results = await Promise.allSettled(
            subscriptions.map(async (sub: any) => {
                try {
                    await webPush.sendNotification(
                        {
                            endpoint: sub.endpoint,
                            keys: { p256dh: sub.p256dh, auth: sub.auth },
                        },
                        payload,
                        { vapidDetails: vapidOptions }
                    );
                } catch (err: any) {
                    if (err.statusCode === 410 || err.statusCode === 404) {
                        await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
                    }
                    errors.push(`${sub.id}: ${err.statusCode || ''} ${err.message || String(err)}`);
                    throw err;
                }
            })
        );

        const sent = results.filter((r: any) => r.status === 'fulfilled').length;
        const failed = results.filter((r: any) => r.status === 'rejected').length;
        console.log(`Push: ${sent}/${subscriptions.length} ok. Errors: ${errors.join('; ')}`);
        return { sent, failed, total: subscriptions.length, errors };
    } catch (err: any) {
        console.error('sendPushToAll error:', err);
        return { sent: 0, failed: 0, error: err.message || String(err) };
    }
}
