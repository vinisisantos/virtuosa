import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';
import { registerHooks } from 'node:module';

// API real com autenticação sintética e banco substituído, sem .env/produção.
registerHooks({ resolve(specifier, context, nextResolve) {
  return nextResolve(specifier === 'next/server' ? 'next/server.js' : specifier, context);
} });
process.env.JWT_SECRET = 'synthetic-no-response-api-test-secret';
let record, reads = 0, writes = 0;
globalThis.prisma = {
  automation: {
    findUnique: async () => { reads++; return record; },
    update: async ({ data }) => { writes++; record = { ...record, ...data }; return record; },
    delete: async () => { writes++; return {}; },
  },
};
const { NextRequest } = await import('next/server.js');
const { signToken } = await import('../src/lib/auth.ts');
const { PUT, POST, DELETE, GET } = await import('../src/app/api/crm/automations/route.ts');
const { noResponseAutomationData } = await import('../src/lib/whatsapp/evaluation-no-response-automation.ts');
const date = new Date('2026-09-07T15:00:00Z');
beforeEach(() => { reads = 0; writes = 0; record = noResponseAutomationData('SCS', date); });
async function request(method, body, role = 'ADMINISTRADOR') {
  const token = role ? await signToken({ userId: 'synthetic', name: 'Teste', email: 'test@example.invalid', role }) : '';
  return new NextRequest('http://localhost/api/crm/automations?id=test', {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
test('sem sessão e sem perfil administrativo não lê nem altera configuração', async () => {
  assert.equal((await PUT(await request('PUT', { id: 'test' }, null))).status, 401);
  assert.equal((await PUT(await request('PUT', { id: 'test' }, 'VENDEDOR'))).status, 403);
  assert.equal((await GET(await request('GET', null, 'VENDEDOR'))).status, 403);
  assert.equal(reads, 0); assert.equal(writes, 0);
});
test('administrador edita prazo/mensagem sem mover unidade ou retroagir ativação', async () => {
  const id = record.id;
  const res = await PUT(await request('PUT', { id, unit: 'Osasco', triggerType: 'new_message', name: 'Outro nome', createdBy: 'Outro',
    triggerConfig: { delayHours: 3, activatedAt: '2000-01-01', instanceIds: ['outra'] },
    steps: [{ type: 'send_message', config: { message: 'Mensagem editada' } }], isActive: true }));
  assert.equal(res.status, 200);
  const a = (await res.json()).automation;
  assert.equal(a.id, id); assert.equal(a.unit, 'SCS'); assert.equal(a.name, 'Lembrete sem resposta — SCS');
  assert.equal(a.triggerConfig.activatedAt, date.toISOString()); assert.equal(a.triggerConfig.delayHours, 3);
  assert.equal(a.steps[0].config.message, 'Mensagem editada'); assert.equal(writes, 1);
});
test('validação rejeita prazo inválido e texto vazio sem gravar', async () => {
  assert.equal((await PUT(await request('PUT', { id: record.id, triggerConfig: { delayHours: 0 } }))).status, 400);
  assert.equal((await PUT(await request('PUT', { id: record.id, steps: [{ type: 'send_message', config: { message: '  ' } }] }))).status, 400);
  assert.equal(writes, 0);
});
test('reativação reinicia marco e tipo nativo não pode ser duplicado/excluído', async () => {
  record.isActive = false;
  assert.equal((await PUT(await request('PUT', { id: record.id, isActive: true }))).status, 200);
  assert.ok(new Date(record.triggerConfig.activatedAt) > date);
  assert.equal((await POST(await request('POST', { name: 'Cópia', triggerType: record.triggerType, steps: record.steps }))).status, 400);
  assert.equal((await DELETE(await request('DELETE'))).status, 400);
  assert.equal(writes, 1);
});
