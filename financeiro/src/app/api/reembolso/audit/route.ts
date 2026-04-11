import { NextRequest, NextResponse } from 'next/server';
import { requireUnitGuard } from '@/lib/unit-guard';
import { prisma } from '@/lib/db';

/* ─── Helper: check admin ─── */
async function isAdmin(userId?: string | null): Promise<boolean> {
  if (!userId) return false;
  try {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true, permissions: true } });
    if (!user) return false;
    const perms = (user.permissions as Record<string, boolean>) || {};
    return user.role === 'ADMINISTRADOR' || perms.admin === true;
  } catch { return false; }
}

/* ═══════════════════════════════
   GET: List audit logs for a ticket
   ═══════════════════════════════ */
export async function GET(req: NextRequest) {
  const guard = requireUnitGuard(req);
  if (guard instanceof NextResponse) return guard;

  try {
    const { searchParams } = new URL(req.url);
    const ticketId = searchParams.get('ticketId');
    const userId = searchParams.get('userId');

    if (!ticketId) return NextResponse.json({ error: 'ticketId obrigatório' }, { status: 400 });

    // Only admins can view audit logs
    const admin = await isAdmin(userId);
    if (!admin) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });

    const logs = await prisma.reembolsoAuditLog.findMany({
      where: { ticketId },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(logs);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Erro ao buscar auditoria' }, { status: 500 });
  }
}
