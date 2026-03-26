/**
 * Mercado Livre API Helper
 * Handles OAuth, token refresh, and API calls.
 */
import { prisma } from '@/lib/db';

const ML_API_BASE = 'https://api.mercadolibre.com';
const ML_AUTH_URL = 'https://auth.mercadolivre.com.br/authorization';

export function getMLAuthUrl(unit: string) {
  const appId = process.env.ML_APP_ID;
  const redirectUri = process.env.ML_REDIRECT_URI;
  return `${ML_AUTH_URL}?response_type=code&client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri!)}&state=${encodeURIComponent(unit)}`;
}

export async function exchangeCodeForToken(code: string) {
  const res = await fetch(`${ML_API_BASE}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: process.env.ML_APP_ID!,
      client_secret: process.env.ML_CLIENT_SECRET!,
      code,
      redirect_uri: process.env.ML_REDIRECT_URI!,
    }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || `ML OAuth error ${res.status}`);
  }
  return res.json();
}

export async function refreshMLToken(refreshToken: string) {
  const res = await fetch(`${ML_API_BASE}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: process.env.ML_APP_ID!,
      client_secret: process.env.ML_CLIENT_SECRET!,
      refresh_token: refreshToken,
    }),
  });
  if (!res.ok) throw new Error(`Token refresh failed: ${res.status}`);
  return res.json();
}

export async function getValidToken(unit: string): Promise<string | null> {
  const conn = await prisma.mercadoLivreConnection.findUnique({ where: { unit } });
  if (!conn || !conn.isActive) return null;

  // Check if token is expired (with 5 min buffer)
  if (new Date() > new Date(conn.expiresAt.getTime() - 5 * 60 * 1000)) {
    try {
      const data = await refreshMLToken(conn.refreshToken);
      await prisma.mercadoLivreConnection.update({
        where: { unit },
        data: {
          accessToken: data.access_token,
          refreshToken: data.refresh_token,
          expiresAt: new Date(Date.now() + data.expires_in * 1000),
        },
      });
      return data.access_token;
    } catch {
      await prisma.mercadoLivreConnection.update({ where: { unit }, data: { isActive: false } });
      return null;
    }
  }
  return conn.accessToken;
}

export async function mlApiGet(token: string, path: string) {
  const res = await fetch(`${ML_API_BASE}${path}`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`ML API error ${res.status}: ${path}`);
  return res.json();
}

export async function syncOrdersForUnit(unit: string) {
  const token = await getValidToken(unit);
  if (!token) return { synced: 0, error: 'Token inválido ou expirado.' };

  const conn = await prisma.mercadoLivreConnection.findUnique({ where: { unit } });
  if (!conn) return { synced: 0, error: 'Conexão não encontrada.' };

  // Fetch orders (buyer)
  const data = await mlApiGet(token, `/orders/search?buyer=${conn.mlUserId}&sort=date_desc&limit=50`);
  const results = data.results || [];
  let synced = 0;

  for (const order of results) {
    const item = order.order_items?.[0];
    if (!item) continue;

    const orderData = {
      connectionId: conn.id,
      unit,
      productTitle: item.item?.title || 'Produto sem título',
      productImageUrl: item.item?.thumbnail || null,
      quantity: item.quantity || 1,
      totalAmount: order.total_amount || 0,
      currencyId: order.currency_id || 'BRL',
      orderStatus: order.status || 'unknown',
      shippingStatus: order.shipping?.status || null,
      trackingNumber: null as string | null,
      trackingUrl: null as string | null,
      sellerNickname: order.seller?.nickname || null,
      buyDate: new Date(order.date_created),
      lastUpdated: new Date(order.last_updated || order.date_created),
      rawData: JSON.stringify(order),
    };

    // Try to get shipping tracking
    if (order.shipping?.id) {
      try {
        const shipping = await mlApiGet(token, `/shipments/${order.shipping.id}`);
        orderData.shippingStatus = shipping.status || orderData.shippingStatus;
        orderData.trackingNumber = shipping.tracking_number || null;
        if (shipping.tracking_number) {
          orderData.trackingUrl = `https://www.mercadolivre.com.br/tracking?tracking_id=${shipping.tracking_number}`;
        }
      } catch { /* ignore shipping errors */ }
    }

    await prisma.mercadoLivreOrder.upsert({
      where: { mlOrderId: String(order.id) },
      update: orderData,
      create: { mlOrderId: String(order.id), ...orderData },
    });
    synced++;
  }

  return { synced, total: results.length };
}
