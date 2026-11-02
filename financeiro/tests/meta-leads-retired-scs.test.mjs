import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';
import { existsSync } from 'node:fs';
import { registerHooks } from 'node:module';

registerHooks({
  resolve(specifier, context, nextResolve) {
    // Este módulo usa sintaxe que o strip-types não aceita e não participa do caminho testado.
    if (specifier.endsWith('whatsapp/number-check')) {
      return { shortCircuit: true, url: 'data:text/javascript,export const checkWhatsAppNumber=async()=>null;export class WhatsAppNumberCheckError extends Error{}' };
    }
    if (specifier.startsWith('.') && context.parentURL && existsSync(new URL(`${specifier}.ts`, context.parentURL))) {
      return nextResolve(`${specifier}.ts`, context);
    }
    return nextResolve(specifier === 'next/server' ? 'next/server.js' : specifier, context);
  },
});

let databaseCalls;

globalThis.prisma = new Proxy({}, {
  get: (_, model) => new Proxy({}, {
    get: (__, method) => async () => {
      databaseCalls.push(`${String(model)}.${String(method)}`);
      return null;
    },
  }),
});

process.env.META_ZAPIER_WEBHOOK_SECRET = 'segredo-de-teste';

const { NextRequest } = await import('next/server.js');
const { POST } = await import('../src/app/api/integrations/zapier/meta-leads/route.ts');

function request(payload) {
  return new NextRequest('http://localhost/api/integrations/zapier/meta-leads', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-zapier-secret': 'segredo-de-teste' },
    body: JSON.stringify(payload),
  });
}

const lead = { leadgen_id: 'lead-1', ad_name: 'Glúteo Perfeito', full_name: 'Lead Teste', phone_number: '11999990000' };

beforeEach(() => { databaseCalls = []; });

for (const [origem, campos] of [
  ['formulário', { form_id: '1363070175195046' }],
  ['campanha', { campaign_id: '120249310857180006' }],
]) {
  test(`lead de ${origem} antigo de SCS é ignorado sem criar registro nem cair em SBC`, async () => {
    const response = await POST(request({ ...lead, ...campos }));

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, ignored: 'unidade_encerrada' });
    assert.deepEqual(databaseCalls, []);
  });
}

test('lead de formulário desconhecido continua sendo recusado', async () => {
  const response = await POST(request({ ...lead, ad_name: 'Anúncio sem campanha', form_id: 'formulario-desconhecido' }));

  assert.equal(response.status, 422);
  assert.deepEqual(databaseCalls, []);
});
