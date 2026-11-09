import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';
import { SignJWT } from 'jose';
import { NextRequest } from 'next/server.js';

registerHooks({ resolve(specifier, context, next) {
  return next(specifier === 'next/server' ? 'next/server.js' : specifier, context);
} });
process.env.JWT_SECRET = 'isolated-build-fixture-secret-not-for-production';
const { middleware } = await import('../src/middleware.ts');
const request = (path, headers = {}) => new NextRequest(`http://localhost${path}`, { headers });

test('APIs privadas rejeitam ausência de sessão, identidade forjada e sessão inválida', async () => {
  for (const headers of [{}, { 'x-user-id': 'forged', 'x-user-role': 'admin' }, { cookie: 'virtuosa_token=invalid' }]) {
    const response = await middleware(request('/api/whatsapp/instances', headers));
    assert.equal(response.status, 401);
  }
});

test('sessão válida injeta a identidade e as permissões reais nas APIs do Inbox e dashboard', async () => {
  const user = { userId: 'fixture-user', name: 'Operadora', email: 'test@example.invalid', unit: 'SBC', role: 'atendente', permissions: { crm: true } };
  const token = await new SignJWT(user).setProtectedHeader({ alg: 'HS256' }).setExpirationTime('1m')
    .sign(new TextEncoder().encode(process.env.JWT_SECRET));
  for (const path of ['/api/whatsapp/instances', '/api/whatsapp/conversations', '/api/crm/dashboard']) {
    const response = await middleware(request(path, { cookie: `virtuosa_token=${token}`, 'x-user-id': 'forged', 'x-user-role': 'admin' }));
    assert.equal(response.headers.get('x-middleware-next'), '1');
    assert.equal(response.headers.get('x-middleware-request-x-user-id'), user.userId);
    assert.equal(response.headers.get('x-middleware-request-x-user-role'), user.role);
    assert.equal(response.headers.get('x-middleware-request-x-user-name'), user.name);
    assert.equal(response.headers.get('x-middleware-request-x-user-unit'), user.unit);
    assert.deepEqual(JSON.parse(response.headers.get('x-middleware-request-x-user-permissions')), user.permissions);
  }
});

test('login, webhooks e worker mantêm autenticação própria sem tornar o painel público', async () => {
  for (const path of ['/api/auth/login', '/api/whatsapp/webhook', '/api/crm/ai-assistant/autonomy/worker']) {
    assert.equal((await middleware(request(path))).headers.get('x-middleware-next'), '1');
  }
  assert.equal((await middleware(request('/api/crm/ai-assistant/autonomy'))).status, 401);
  assert.equal((await middleware(request('/api/crm/ai-assistant/autonomy/worker-other'))).status, 401);
});
