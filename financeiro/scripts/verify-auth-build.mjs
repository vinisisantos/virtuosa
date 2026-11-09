import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function verifyAuthBuild(buildDirectory = '.next') {
  const manifestPath = resolve(buildDirectory, 'server/middleware-manifest.json');
  assert.ok(existsSync(manifestPath), 'Build sem manifesto de middleware de autenticação.');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const middleware = manifest.middleware?.['/'];
  assert.ok(middleware, 'Build sem middleware de autenticação: confira src/middleware.ts.');

  const matchers = middleware.matchers ?? [];
  for (const pathname of ['/api/whatsapp/conversations', '/api/whatsapp/instances', '/api/crm/dashboard']) {
    assert.ok(
      matchers.some(matcher => typeof matcher.regexp === 'string' && new RegExp(matcher.regexp).test(pathname)),
      `Middleware compilado não protege ${pathname}.`,
    );
  }
  assert.ok(middleware.files?.length, 'Middleware compilado sem artefatos.');
  for (const file of middleware.files) {
    assert.ok(existsSync(resolve(buildDirectory, file)), 'Artefato de middleware ausente no build.');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    verifyAuthBuild();
    console.log('Middleware de autenticação compilado e cobertura das APIs verificados.');
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Falha ao validar middleware de autenticação.');
    process.exitCode = 1;
  }
}
