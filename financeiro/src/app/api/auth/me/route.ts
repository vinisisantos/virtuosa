import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';

/**
 * GET /api/auth/me — Validates the current session and returns user info from JWT
 */
export async function GET(req: NextRequest) {
  const result = await requireAuth(req);
  if ('error' in result) return result.error;
  
  const { user } = result;
  return NextResponse.json({
    authenticated: true,
    user: {
      id: user.userId,
      name: user.name,
      email: user.email,
      role: user.role,
      unit: user.unit,
      permissions: user.permissions,
    }
  });
}
