import { NextRequest, NextResponse } from 'next/server';
import { clearAuthCookie, requireAuth, setAuthCookie, signToken } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { canonicalUserUnit } from '@/lib/role-access';

/**
 * GET /api/auth/me — Validates the current session and refreshes user info
 * from the database, so permission changes made by an admin apply without
 * requiring a manual logout/login cycle.
 */
export async function GET(req: NextRequest) {
  const result = await requireAuth(req);
  if ('error' in result) return result.error;

  const sessionUser = result.user;
  const currentUser = await prisma.user.findUnique({
    where: { id: sessionUser.userId },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      role: true,
      unit: true,
      permissions: true,
      isActive: true,
    },
  });

  if (!currentUser || !currentUser.isActive) {
    const response = NextResponse.json(
      { authenticated: false, error: 'Sessão inválida ou usuário desativado.' },
      { status: 401 },
    );
    return clearAuthCookie(response);
  }

  const permissions = (currentUser.permissions as Record<string, boolean>) || {};
  const sessionUnit = canonicalUserUnit({
    role: currentUser.role,
    permissions,
    unit: currentUser.unit,
  });
  const token = await signToken({
    userId: currentUser.id,
    email: currentUser.email,
    name: currentUser.name,
    role: currentUser.role,
    unit: sessionUnit || undefined,
    permissions,
  });

  const response = NextResponse.json({
    authenticated: true,
    user: {
      id: currentUser.id,
      name: currentUser.name,
      email: currentUser.email,
      phone: currentUser.phone,
      role: currentUser.role,
      unit: sessionUnit,
      permissions,
    }
  });

  return setAuthCookie(response, token);
}
