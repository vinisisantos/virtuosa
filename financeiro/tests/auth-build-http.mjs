import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { verifyAuthBuild } from '../scripts/verify-auth-build.mjs';

// Executa o servidor compilado real, sem interceptar APIs e sem credenciais reais.
verifyAuthBuild();
const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', '0'], {
  cwd: new URL('../', import.meta.url),
  env: {
    ...process.env,
    DATABASE_URL: 'postgresql://test:test@127.0.0.1:9/isolated',
    DIRECT_URL: 'postgresql://test:test@127.0.0.1:9/isolated',
    JWT_SECRET: 'isolated-build-fixture-secret-not-for-production',
    NEXT_TELEMETRY_DISABLED: '1',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let output = '';
for (const stream of [server.stdout, server.stderr]) stream.on('data', data => { output += data.toString(); });
try {
  let base;
  for (let attempt = 0; attempt < 100; attempt++) {
    base = output.match(/http:\/\/127\.0\.0\.1:\d+/)?.[0];
    if (base && /Ready in/.test(output)) break;
    assert.equal(server.exitCode, null, 'Servidor compilado encerrou antes dos testes.');
    await delay(100);
  }
  assert.ok(base && /Ready in/.test(output), 'Servidor compilado não ficou pronto.');

  for (const path of ['/api/whatsapp/conversations', '/api/whatsapp/instances', '/api/crm/dashboard', '/api/crm/ai-assistant/autonomy']) {
    for (const headers of [{}, { 'x-user-id': 'forged', 'x-user-role': 'admin' }, { cookie: 'virtuosa_token=invalid' }]) {
      const response = await fetch(`${base}${path}`, { headers, redirect: 'manual', signal: AbortSignal.timeout(5_000) });
      assert.equal(response.status, 401, `${path} deve exigir sessão válida mesmo com identidade enviada pelo cliente.`);
      assert.ok((await response.json()).error);
    }
  }
  assert.equal((await fetch(`${base}/api/auth/login`, { redirect: 'manual' })).status, 405, 'Login público deve chegar à rota, que só aceita POST.');
  assert.equal((await fetch(`${base}/login.html`, { redirect: 'manual' })).status, 200, 'Página de login continua pública.');
  console.log('HTTP real do build: 12 requisições sem sessão/forjadas/expiradas bloqueadas; login público preservado.');
} finally {
  server.kill('SIGTERM');
  await new Promise(resolve => {
    if (server.exitCode !== null) return resolve();
    server.once('exit', resolve);
  });
}
