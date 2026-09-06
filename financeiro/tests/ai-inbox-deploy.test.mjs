import assert from 'node:assert/strict';
import test from 'node:test';
import { assertPreparationAccess, prepare } from '../scripts/prepare-ai-inbox-scs.mjs';

test('preparação rejeita cada permissão administrativa ausente', () => {
  const allowed = { database_create: true, public_create: true, extensions_create: true, cron_usage: true };
  assert.doesNotThrow(() => assertPreparationAccess(allowed));
  for (const key of Object.keys(allowed)) assert.throws(() => assertPreparationAccess({ ...allowed, [key]: false }));
  assert.throws(() => assertPreparationAccess(null));
});

test('vector só pode estar ausente ou no schema esperado', () => {
  const allowed = { database_create: true, public_create: true, extensions_create: true, cron_usage: true };
  assert.doesNotThrow(() => assertPreparationAccess(allowed, 'extensions'));
  assert.throws(() => assertPreparationAccess(allowed, 'public'));
});

test('preparação não acessa banco fora de deploy explicitamente autorizado', async () => {
  const original = { env: process.env.VERCEL_ENV, flag: process.env.AI_INBOX_PREPARE_ON_DEPLOY };
  try {
    process.env.VERCEL_ENV = 'development';
    process.env.AI_INBOX_PREPARE_ON_DEPLOY = 'true';
    await assert.rejects(prepare());
    process.env.VERCEL_ENV = 'production';
    process.env.AI_INBOX_PREPARE_ON_DEPLOY = 'false';
    await assert.rejects(prepare());
  } finally {
    if (original.env === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = original.env;
    if (original.flag === undefined) delete process.env.AI_INBOX_PREPARE_ON_DEPLOY; else process.env.AI_INBOX_PREPARE_ON_DEPLOY = original.flag;
  }
});
