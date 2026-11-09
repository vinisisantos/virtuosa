import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { verifyAuthBuild } from '../scripts/verify-auth-build.mjs';

function buildFixture(t, middleware) {
  const directory = mkdtempSync(join(tmpdir(), 'virtuosa-auth-build-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  mkdirSync(join(directory, 'server'));
  writeFileSync(join(directory, 'server/middleware-manifest.json'), JSON.stringify({ middleware }));
  return directory;
}

const compiledMiddleware = {
  files: ['server/middleware.js'],
  matchers: [{ regexp: '^/api(?:/.*)?$' }],
};

test('build rejeita manifesto vazio que fazia instâncias e dashboard desaparecerem', t => {
  assert.throws(() => verifyAuthBuild(buildFixture(t, {})), /sem middleware de autenticação/);
});

test('build exige proteção nas APIs e os artefatos compilados', t => {
  const directory = buildFixture(t, { '/': compiledMiddleware });
  assert.throws(() => verifyAuthBuild(directory), /Artefato de middleware ausente/);
  writeFileSync(join(directory, 'server/middleware.js'), '// fixture');
  assert.doesNotThrow(() => verifyAuthBuild(directory));

  const noApiProtection = { ...compiledMiddleware, matchers: [{ regexp: '^/crm$' }] };
  assert.throws(() => verifyAuthBuild(buildFixture(t, { '/': noApiProtection })), /não protege/);
});

test('middleware fica junto de src/app e sua validação faz parte do build de produção', () => {
  assert.ok(existsSync(new URL('../src/middleware.ts', import.meta.url)), 'Middleware deve ficar em src junto de app.');
  assert.equal(existsSync(new URL('../middleware.ts', import.meta.url)), false, 'Não manter middleware duplicado na raiz.');
  assert.doesNotMatch(readFileSync(new URL('../.gitignore', import.meta.url), 'utf8'), /^src\/middleware\.ts$/m);
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.match(pkg.scripts.build, /next build --webpack && node scripts\/verify-auth-build\.mjs/);
});
