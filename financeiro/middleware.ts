import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || 'virtuosa-finance-secret-key-2026');

// API routes that do NOT require authentication
const PUBLIC_API_ROUTES = [
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/logout',
  '/api/assinafy/webhook',
  '/api/signatures',
];

// Pages that do NOT require authentication
const PUBLIC_PAGES = [
  '/login.html',
  '/login',
  '/assinar',
];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Skip static assets, _next, favicon, etc.
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/static') ||
    pathname.includes('.') && !pathname.endsWith('.html') ||
    pathname === '/favicon.ico' ||
    pathname === '/icon.png'
  ) {
    return NextResponse.next();
  }

  // Public API routes — no auth needed
  if (PUBLIC_API_ROUTES.some(r => pathname.startsWith(r))) {
    return NextResponse.next();
  }

  // API routes — require valid JWT
  if (pathname.startsWith('/api/')) {
    const token = req.cookies.get('virtuosa_token')?.value
      || req.headers.get('authorization')?.replace('Bearer ', '');

    if (!token) {
      return NextResponse.json(
        { error: 'Não autorizado. Faça login novamente.' },
        { status: 401 }
      );
    }

    try {
      const { payload } = await jwtVerify(token, JWT_SECRET);

      // Add user info to request headers for downstream API routes
      const requestHeaders = new Headers(req.headers);
      requestHeaders.set('x-user-id', payload.userId as string || '');
      requestHeaders.set('x-user-email', payload.email as string || '');
      requestHeaders.set('x-user-name', payload.name as string || '');
      requestHeaders.set('x-user-role', payload.role as string || '');
      requestHeaders.set('x-user-unit', payload.unit as string || '');
      if (payload.permissions) {
        requestHeaders.set('x-user-permissions', JSON.stringify(payload.permissions));
      }

      return NextResponse.next({ request: { headers: requestHeaders } });
    } catch {
      return NextResponse.json(
        { error: 'Token inválido ou expirado. Faça login novamente.' },
        { status: 401 }
      );
    }
  }

  // Public pages — no auth needed
  if (PUBLIC_PAGES.some(p => pathname === p || pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // App pages — check auth, redirect to login if invalid
  const token = req.cookies.get('virtuosa_token')?.value;
  if (!token) {
    // Don't redirect — let client-side auth-guard handle it (backwards compat with localStorage)
    return NextResponse.next();
  }

  try {
    await jwtVerify(token, JWT_SECRET);
    return NextResponse.next();
  } catch {
    // Invalid/expired token — clear it
    const response = NextResponse.next();
    response.cookies.set('virtuosa_token', '', { maxAge: 0, path: '/' });
    return response;
  }
}

export const config = {
  matcher: [
    // Match all API routes
    '/api/:path*',
    // Match all app pages (not static files)
    '/((?!_next/static|_next/image|favicon.ico|icon.png).*)',
  ],
};
