import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUnitGuard } from '@/lib/unit-guard';

const POINTS_PER_VISIT = 10;
const POINTS_PER_100_REAIS = 5;
const BIRTHDAY_BONUS = 50;

export async function GET(req: NextRequest) {
  const guard = requireUnitGuard(req);
  if (guard instanceof NextResponse) return guard;

  const { searchParams } = new URL(req.url);
  const clientId = searchParams.get('clientId');

  if (clientId) {
    // UNIT GUARD: Filter by unit
    const where: any = { clientId };
    if (guard.unitFilter) where.unit = guard.unitFilter;

    const transactions = await prisma.loyaltyTransaction.findMany({
      where, orderBy: { createdAt: 'desc' }, take: 50,
    });
    const totalEarned = transactions.filter(t => t.type === 'earn').reduce((s, t) => s + t.points, 0);
    const totalRedeemed = transactions.filter(t => t.type === 'redeem').reduce((s, t) => s + Math.abs(t.points), 0);
    return NextResponse.json({ transactions, balance: totalEarned - totalRedeemed, totalEarned, totalRedeemed });
  }

  // Leaderboard - scoped by unit
  const unitWhere: any = {};
  if (guard.unitFilter) unitWhere.unit = guard.unitFilter;

  const all = await prisma.loyaltyTransaction.findMany({ where: unitWhere });
  const clientMap: Record<string, { clientId: string; clientName: string; earned: number; redeemed: number }> = {};
  all.forEach(t => {
    if (!clientMap[t.clientId]) clientMap[t.clientId] = { clientId: t.clientId, clientName: t.clientName, earned: 0, redeemed: 0 };
    if (t.type === 'earn') clientMap[t.clientId].earned += t.points;
    else clientMap[t.clientId].redeemed += Math.abs(t.points);
  });
  const leaderboard = Object.values(clientMap).map(c => ({ ...c, balance: c.earned - c.redeemed })).sort((a, b) => b.balance - a.balance);

  return NextResponse.json({ leaderboard, rules: { POINTS_PER_VISIT, POINTS_PER_100_REAIS, BIRTHDAY_BONUS } });
}

export async function POST(req: NextRequest) {
  const guard = requireUnitGuard(req);
  if (guard instanceof NextResponse) return guard;

  const body = await req.json();

  let points = body.points;
  if (!points) {
    if (body.reason === 'visit') points = POINTS_PER_VISIT;
    else if (body.reason === 'purchase' && body.amount) points = Math.floor(body.amount / 100) * POINTS_PER_100_REAIS;
    else if (body.reason === 'birthday') points = BIRTHDAY_BONUS;
    else if (body.reason === 'referral') points = 25;
    else points = body.points || 0;
  }

  const transaction = await prisma.loyaltyTransaction.create({
    data: {
      clientId: body.clientId, clientName: body.clientName,
      points: body.type === 'redeem' ? -Math.abs(points) : Math.abs(points),
      type: body.type || 'earn', reason: body.reason || 'visit',
      description: body.description || null,
      unit: guard.createUnit(), // UNIT GUARD: Force JWT unit
    },
  });
  return NextResponse.json(transaction);
}
