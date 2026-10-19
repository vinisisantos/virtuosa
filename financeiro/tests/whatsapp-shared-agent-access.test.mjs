import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';
import { registerHooks } from 'node:module';

registerHooks({ resolve(specifier, context, nextResolve) {
  return nextResolve(specifier === 'next/server' ? 'next/server.js' : specifier, context);
} });

// O resolvedor real recebe somente registros sintéticos; nenhuma conexão é criada.
let instances, configurationWrites;
function accessible(instance, where) {
  return where.OR.some((condition) => (
    condition.userId === instance.userId
    || condition.members && instance.members.some((member) => (
      member.userId === condition.members.some.userId && member.isActive === true
    ))
  ));
}
function selected(instance) {
  return instance ? structuredClone({
    ...instance,
    members: instance.members.filter((member) => member.isActive === true),
  }) : null;
}

globalThis.prisma = {
  whatsAppInstance: {
    findUnique: async ({ where }) => selected(instances.find((instance) => instance.id === where.id)),
    findFirst: async ({ where }) => selected(instances.find((instance) => instance.id === where.id && accessible(instance, where))),
    findMany: async ({ where }) => instances.filter((instance) => accessible(instance, where)).map(selected),
  },
  appSetting: { findMany: async () => [] },
  user: { findMany: async ({ where }) => where.id.in.map((id) => ({
    id, name: 'Usuário sintético', role: 'VENDEDOR', unit: 'Osasco', isActive: true,
  })) },
  $transaction: async (callback) => callback({
    whatsAppInstanceMember: {
      updateMany: async (args) => { configurationWrites.push(args); return { count: 0 }; },
      upsert: async (args) => { configurationWrites.push(args); return args.create; },
    },
    whatsAppInstance: {
      update: async ({ where, data }) => ({ id: where.id, ...data }),
    },
    activityLog: { create: async () => ({ id: 'audit-synthetic' }) },
  }),
};

const { getInstanceAccessForUser, getInstancesForRequest } = await import('../src/lib/whatsapp/instance-resolver.ts');
const { GET } = await import('../src/app/api/whatsapp/instances/route.ts');
const { PATCH: updateTeam } = await import('../src/app/api/whatsapp/admin/instances/route.ts');

beforeEach(() => {
  configurationWrites = [];
  instances = [{
    id: 'osasco-shared', userId: 'technical-owner', unit: 'Osasco', status: 'connected',
    assignmentMode: 'DEFAULT_ASSIGNEE', name: 'synthetic-osasco',
    members: [{ userId: 'operator', role: 'AGENT_SHARED', isActive: true }],
  }, {
    id: 'sbc-other', userId: 'different-owner', unit: 'SBC', status: 'connected',
    assignmentMode: 'OWNER', name: 'synthetic-sbc', members: [],
  }];
});

function request({ instanceId = 'osasco-shared', unit = 'Osasco', role = 'VENDEDOR', userId = 'operator' } = {}) {
  return new Request(`http://synthetic.invalid/api/whatsapp/instances?targetInstanceId=${instanceId}&unit=${unit}`, {
    headers: { 'x-user-id': userId, 'x-user-name': 'Operadora', 'x-user-role': role, 'x-user-unit': 'Osasco' },
  });
}

test('atendente de equipe responde conversas de outros sem administrar nem reconectar', async () => {
  const access = await getInstanceAccessForUser('osasco-shared', 'operator');
  assert.equal(access.accessRole, 'AGENT_SHARED');
  assert.equal(access.canView, true);
  assert.equal(access.canReply, true);
  assert.equal(access.canReplyAcrossAssignments, true);
  assert.equal(access.canManage, false);
  assert.equal(access.canReconnect, false);
});

test('papéis existentes preservam capacidades e não recebem a exceção de atribuição', async () => {
  for (const [role, canReply, canManage] of [
    ['AGENT', true, false], ['VIEWER', false, false],
    ['MANAGER', true, true], ['OWNER', true, true],
  ]) {
    instances[0].members[0].role = role;
    const access = await getInstanceAccessForUser('osasco-shared', 'operator');
    assert.equal(access.accessRole, role);
    assert.equal(access.canReply, canReply);
    assert.equal(access.canManage, canManage);
    assert.equal(access.canReconnect, canManage);
    assert.equal(access.canReplyAcrossAssignments, false);
  }
});

test('proprietário sem associação explícita e proxy administrativo preservam a regra anterior', async () => {
  instances[0].members = [];
  const owner = await getInstanceAccessForUser('osasco-shared', 'technical-owner');
  assert.equal(owner.accessRole, 'OWNER');
  assert.equal(owner.canManage, true);
  assert.equal(owner.canReplyAcrossAssignments, false);
  const { instances: allowed } = await getInstancesForRequest(request({ role: 'ADMINISTRADOR', userId: 'admin' }));
  assert.equal(allowed[0].accessRole, 'ADMIN');
  assert.equal(allowed[0].canManage, true);
  assert.equal(allowed[0].canReplyAcrossAssignments, false);
});

test('capacidade é própria da associação selecionada e não se propaga para outra caixa', async () => {
  instances[1].members = [{ userId: 'operator', role: 'AGENT', isActive: true }];
  const osasco = await getInstancesForRequest(request());
  const sbc = await getInstancesForRequest(request({ instanceId: 'sbc-other', unit: 'SBC' }));
  assert.deepEqual(osasco.instances.map((instance) => instance.id), ['osasco-shared']);
  assert.equal(osasco.instances[0].canReplyAcrossAssignments, true);
  assert.deepEqual(sbc.instances.map((instance) => instance.id), ['sbc-other']);
  assert.equal(sbc.instances[0].canReply, true);
  assert.equal(sbc.instances[0].canReplyAcrossAssignments, false);
});

test('papel de equipe não libera instância alheia nem unidade divergente', async () => {
  assert.deepEqual((await getInstancesForRequest(request({ instanceId: 'sbc-other', unit: 'SBC' }))).instances, []);
  assert.deepEqual((await getInstancesForRequest(request({ unit: 'SBC' }))).instances, []);
});

test('associação desativada e papel desconhecido não concedem a capacidade', async () => {
  instances[0].members[0].isActive = false;
  assert.equal(await getInstanceAccessForUser('osasco-shared', 'operator'), null);
  assert.deepEqual((await getInstancesForRequest(request())).instances, []);
  instances[0].members[0].isActive = true;
  instances[0].members[0].role = 'UNRECOGNIZED_ROLE';
  const access = await getInstanceAccessForUser('osasco-shared', 'operator');
  assert.equal(access.accessRole, 'VIEWER');
  assert.equal(access.canReply, false);
  assert.equal(access.canReplyAcrossAssignments, false);
});

test('lista de instâncias publica a capacidade sem expor poderes de gestão', async () => {
  const response = await GET(request());
  assert.equal(response.status, 200);
  const { instances: listed } = await response.json();
  assert.equal(listed.length, 1);
  assert.equal(listed[0].id, 'osasco-shared');
  assert.equal(listed[0].accessRole, 'AGENT_SHARED');
  assert.equal(listed[0].canReplyAcrossAssignments, true);
  assert.equal(listed[0].canReply, true);
  assert.equal(listed[0].canManage, false);
  assert.equal(listed[0].canReconnect, false);
});

test('administrador pode configurar o novo papel e escolhê-lo como responsável padrão', async () => {
  const response = await updateTeam(new Request(request({ role: 'ADMINISTRADOR', userId: 'admin' }), {
    method: 'PATCH',
    body: JSON.stringify({
      id: 'osasco-shared', assignmentMode: 'DEFAULT_ASSIGNEE', defaultAssigneeId: 'operator',
      members: [{ userId: 'operator', role: 'AGENT_SHARED' }],
    }),
  }));
  assert.equal(response.status, 200);
  assert.deepEqual(configurationWrites[1].where, {
    instanceId_userId: { instanceId: 'osasco-shared', userId: 'operator' },
  });
  assert.deepEqual(configurationWrites[1].update, { role: 'AGENT_SHARED', isActive: true });
});

test('novo papel não permite administrar a própria equipe', async () => {
  const response = await updateTeam(new Request(request(), {
    method: 'PATCH', body: JSON.stringify({ id: 'osasco-shared', members: [] }),
  }));
  assert.equal(response.status, 403);
  assert.deepEqual(configurationWrites, []);
});
