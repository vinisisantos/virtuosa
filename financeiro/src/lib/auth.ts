import { SignJWT, jwtVerify, JWTPayload } from 'jose';
import { NextRequest, NextResponse } from 'next/server';

function getJwtSecret() {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET environment variable is required');
  return new TextEncoder().encode(process.env.JWT_SECRET);
}

export interface AuthPayload extends JWTPayload {
  userId: string;
  email: string;
  name: string;
  role: string;
  unit?: string;
  permissions?: Record<string, boolean>;
}

/**
 * Generate a JWT token for a user
 */
export async function signToken(payload: Omit<AuthPayload, 'iat' | 'exp'>): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(getJwtSecret());
}

/**
 * Verify and decode a JWT token
 */
export async function verifyToken(token: string): Promise<AuthPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret());
    return payload as AuthPayload;
  } catch {
    return null;
  }
}

/**
 * Extract auth payload from a request (checks cookie first, then Authorization header)
 */
export async function getAuthFromRequest(req: NextRequest): Promise<AuthPayload | null> {
  // 1. Check httpOnly cookie
  const cookieToken = req.cookies.get('virtuosa_token')?.value;
  if (cookieToken) {
    const payload = await verifyToken(cookieToken);
    if (payload) return payload;
  }

  // 2. Check Authorization header (Bearer token)
  const authHeader = req.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const payload = await verifyToken(token);
    if (payload) return payload;
  }

  return null;
}

/**
 * Middleware helper: require authentication. Returns the user payload or a 401 response.
 */
export async function requireAuth(req: NextRequest): Promise<{ user: AuthPayload } | { error: NextResponse }> {
  const user = await getAuthFromRequest(req);
  if (!user) {
    return { error: NextResponse.json({ error: 'Não autorizado. Faça login novamente.' }, { status: 401 }) };
  }
  return { user };
}

/**
 * Middleware helper: require specific role(s)
 */
export async function requireRole(req: NextRequest, roles: string[]): Promise<{ user: AuthPayload } | { error: NextResponse }> {
  const result = await requireAuth(req);
  if ('error' in result) return result;
  
  if (!roles.includes(result.user.role)) {
    return { error: NextResponse.json({ error: 'Acesso negado. Permissão insuficiente.' }, { status: 403 }) };
  }
  return result;
}

/**
 * Check if user has a specific permission
 */
export function hasPermission(user: AuthPayload, permission: string): boolean {
  // Admins have all permissions
  if (user.role === 'ADMINISTRADOR') return true;
  
  const perms = user.permissions as Record<string, boolean> | undefined;
  if (!perms) return false;
  return perms[permission] === true;
}

/**
 * Create response with auth cookie set
 */
export function setAuthCookie(response: NextResponse, token: string): NextResponse {
  response.cookies.set('virtuosa_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: '/',
  });
  return response;
}

/**
 * Create response with auth cookie cleared
 */
export function clearAuthCookie(response: NextResponse): NextResponse {
  response.cookies.set('virtuosa_token', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  });
  return response;
}

/**
 * Get user info from request headers (injected by middleware)
 * Use this in API routes for fast, no-verify access to user info.
 */
export function getUserFromHeaders(req: NextRequest): {
  userId: string;
  email: string;
  name: string;
  role: string;
  unit: string;
  permissions: Record<string, boolean> | null;
  isAdmin: boolean;
} | null {
  const userId = req.headers.get('x-user-id');
  if (!userId) return null;
  
  const role = req.headers.get('x-user-role') || '';
  let permissions: Record<string, boolean> | null = null;
  try {
    const permsStr = req.headers.get('x-user-permissions');
    if (permsStr) permissions = JSON.parse(permsStr);
  } catch {}

  return {
    userId,
    email: req.headers.get('x-user-email') || '',
    name: req.headers.get('x-user-name') || '',
    role,
    unit: req.headers.get('x-user-unit') || '',
    permissions,
    isAdmin: role === 'ADMINISTRADOR',
  };
}
