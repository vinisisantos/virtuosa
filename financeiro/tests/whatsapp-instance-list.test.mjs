import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';
import { registerHooks } from 'node:module';
registerHooks({ resolve(specifier, context, next) { return next(specifier === 'next/server' ? 'next/server.js' : specifier, context); } });
let rows, writes, reads, remoteCalls;
globalThis.prisma = {
  whatsAppInstance: {
    findMany: async args => { reads.push(args); return rows; },
    create: async () => { writes++; throw new Error('Unexpected create'); },
    update: async () => { writes++; return {}; },
  },
  user: { findMany: async () => [{ id: 'owner', name: 'Operadora', role: 'VENDEDOR', unit: 'Osasco' }, { id: 'administrator', name: 'Admin', role: 'ADMINISTRADOR', unit: 'Todas' }] },
  appSetting: { findMany: async () => [] },
};
const { GET } = await import('../src/app/api/whatsapp/admin/instances/route.ts');
const instance = (status, id = status) => ({ id, name: id, unit: 'Osasco', status, userId: 'owner', provider: 'evolution', members: [], assignmentMode: 'OWNER' });
const req = (query = '', role = 'ADMINISTRADOR') => new Request(`http://localhost/api/whatsapp/admin/instances${query}`, { headers: { 'x-user-id': 'viewer', 'x-user-role': role, 'x-user-unit': 'Osasco' } });
beforeEach(() => {
  rows = [instance('connected'), instance('disconnected'), instance('archived')];
  writes = 0; reads = []; remoteCalls = [];
  globalThis.fetch = async (url, options) => {
    remoteCalls.push({ url, options });
    throw new Error('Provider offline');
  };
});
test('listagem padrão é local, sem depender do provedor nem escrever', async () => {
  const res = await GET(req('?unit=Osasco&includeInactive=true'));
  assert.equal(res.status, 200);
  assert.deepEqual((await res.json()).instances.map(i => i.status), ['connected', 'disconnected']);
  assert.deepEqual(reads[0].where, { unit: 'Osasco' });
  assert.equal(remoteCalls.length, 0);
  assert.equal(writes, 0);
});
test('sem includeInactive preserva filtro e admin pode consultar arquivadas explicitamente', async () => {
  assert.deepEqual((await (await GET(req())).json()).instances.map(i => i.status), ['connected']);
  assert.equal((await (await GET(req('?includeArchived=true&includeInactive=true'))).json()).instances.length, 3);
});
test('atualização explícita conserva estados quando provedor falha e não consulta arquivadas', async () => {
  const res = await GET(req('?refresh=true&includeInactive=true'));
  assert.equal(res.status, 200);
  assert.deepEqual((await res.json()).instances.map(i => i.status), ['connected', 'disconnected']);
  assert.equal(remoteCalls.length, 3);
  assert.ok(remoteCalls.every(call => call.options.signal instanceof AbortSignal));
  assert.ok(remoteCalls.every(call => !call.url.endsWith('/archived')));
  assert.equal(writes, 0);
});
test('falha de formato na lista remota não derruba o cadastro e estado ao vivo só escreve na atualização', async () => {
  globalThis.fetch = async url => Response.json(String(url).endsWith('/fetchInstances') ? { error: 'invalid' } : { instance: { state: 'open' } });
  const res = await GET(req('?refresh=true&includeInactive=true'));
  assert.equal(res.status, 200);
  assert.deepEqual((await res.json()).instances.map(i => i.status), ['connected', 'connected']);
  assert.equal(writes, 1);
});
test('sem papel administrativo não consulta nem expõe caixas', async () => {
  assert.equal((await GET(req('?includeInactive=true', 'VENDEDOR'))).status, 403);
  assert.equal(reads.length, 0);
  assert.equal(remoteCalls.length, 0);
});
test('marketing continua restrito às unidades e proprietários autorizados', async () => {
  assert.equal((await GET(req('?unit=SBC', 'MARKETING'))).status, 403);
  assert.equal(reads.length, 0);
  rows.push({ ...instance('connected', 'admin-box'), userId: 'administrator' });
  const res = await GET(req('?unit=Osasco&includeInactive=true', 'MARKETING'));
  assert.equal(res.status, 200);
  const result = (await res.json()).instances;
  assert.ok(result.every(i => i.canReply === false && i.canManage === false));
  assert.ok(result.every(i => i.id !== 'admin-box'));
});
