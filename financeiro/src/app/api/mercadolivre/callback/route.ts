import { NextRequest, NextResponse } from 'next/server';
import { requireUnitGuard } from '@/lib/unit-guard';
import { exchangeCodeForToken, mlApiGet, syncOrdersForUnit } from '@/lib/mercadolivre';
import { prisma } from '@/lib/db';

/* GET /api/mercadolivre/callback?code=...&state=SBC */
export async function GET(req: NextRequest) {
  const guard = requireUnitGuard(req);
  if (guard instanceof NextResponse) return guard;

  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const unit = searchParams.get('state');

  if (!code || !unit) {
    return NextResponse.redirect(new URL('/pedidos?ml_error=missing_params', req.url));
  }

  try {
    const tokenData = await exchangeCodeForToken(code);
    const { access_token, refresh_token, expires_in, user_id } = tokenData;

    // Get user info
    let mlUsername = null;
    try {
      const userInfo = await mlApiGet(access_token, `/users/${user_id}`);
      mlUsername = userInfo.nickname || userInfo.first_name || null;
    } catch { /* ignore */ }

    // Save or update connection
    await prisma.mercadoLivreConnection.upsert({
      where: { unit },
      update: {
        mlUserId: String(user_id),
        accessToken: access_token,
        refreshToken: refresh_token,
        expiresAt: new Date(Date.now() + expires_in * 1000),
        mlUsername,
        isActive: true,
      },
      create: {
        unit,
        mlUserId: String(user_id),
        accessToken: access_token,
        refreshToken: refresh_token,
        expiresAt: new Date(Date.now() + expires_in * 1000),
        mlUsername,
        isActive: true,
      },
    });

    // Initial sync
    try {
      await syncOrdersForUnit(unit);
    } catch { /* initial sync can fail, user can retry */ }

    return NextResponse.redirect(new URL(`/pedidos?ml_success=${unit}`, req.url));
  } catch (err: any) {
    console.error('ML callback error:', err);
    return NextResponse.redirect(new URL(`/pedidos?ml_error=${encodeURIComponent(err.message)}`, req.url));
  }
}
