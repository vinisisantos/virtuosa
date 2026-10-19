import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';
import { registerHooks } from 'node:module';

// Rota e ACL reais; os cabeçalhos representam a sessão já validada pelo middleware.
// Todo acesso Prisma é substituído antes dos imports, sem .env ou serviços reais.
registerHooks({ resolve(specifier, context, nextResolve) {
  return nextResolve(specifier === 'next/server' ? 'next/server.js' : specifier, context);
} });

let instances, conversation, effects, conversationReads, claimFilters;
let beforeClaim, afterRead;

function snapshot() {
  return structuredClone({
    ...conversation,
    instance: instances.find((instance) => instance.id === conversation.instanceId),
    contact: { phone: '5511999999999', unit: 'Osasco' },
  });
}

function matches(where, record) {
  return Object.entries(where).every(([key, value]) => record[key] === value);
}

const transactionDatabase = {
  whatsAppConversation: {
    update: async ({ where, data }) => {
      claimFilters.push(structuredClone(where));
      beforeClaim?.();
      beforeClaim = null;
      if (!matches(where, conversation)) {
        throw Object.assign(new Error('Synthetic concurrent conversation change'), { code: 'P2025' });
      }
      effects.claims++;
      const { reopenCount, ...fields } = data;
      conversation = {
        ...conversation,
        ...fields,
        reopenCount: conversation.reopenCount + (reopenCount?.increment || 0),
      };
      return structuredClone(conversation);
    },
  },
  client: {
    findMany: async ({ where }) => {
      effects.pipelineReads++;
      assert.equal(where.unit, 'Osasco');
      return [{ id: 'client-osasco' }];
    },
    updateMany: async () => { effects.clients++; return { count: 1 }; },
  },
  salesPipeline: {
    findMany: async ({ where }) => {
      assert.equal(where.unit, 'Osasco');
      return [{
        id: 'deal-osasco', clientId: 'client-osasco', clientName: 'Lead sintético',
        pipelineId: 'pipeline-osasco', stage: 'novo_lead', stageId: 'stage-new',
      }];
    },
    updateMany: async () => { effects.deals++; return { count: 1 }; },
  },
  pipelineStage: {
    findMany: async () => [
      { id: 'stage-new', name: 'Novo Lead', pipelineId: 'pipeline-osasco', position: 0 },
      { id: 'stage-service', name: 'Em Atendimento', pipelineId: 'pipeline-osasco', position: 1 },
    ],
  },
  auditLog: {
    create: async ({ data }) => {
      effects.auditUsers.push(data.userName);
      assert.equal(data.unit, 'Osasco');
      return { id: 'audit-synthetic' };
    },
  },
};

globalThis.prisma = {
  whatsAppInstance: {
    findUnique: async ({ where }) => structuredClone(instances.find((item) => item.id === where.id) || null),
  },
  whatsAppConversation: {
    findFirst: async ({ where }) => {
      conversationReads.push(structuredClone(where));
      if (where.id !== conversation.id || !where.instanceId.in.includes(conversation.instanceId)) return null;
      const result = snapshot();
      await afterRead?.();
      return result;
    },
  },
  $transaction: async (callback) => callback(transactionDatabase),
};

const { PATCH } = await import('../src/app/api/whatsapp/conversations/[id]/reopen/route.ts');

beforeEach(() => {
  instances = [{
    id: 'instance-osasco', userId: 'technical-owner', unit: 'Osasco', status: 'connected',
    assignmentMode: 'DEFAULT_ASSIGNEE',
    members: [
      { userId: 'operator', role: 'AGENT', isActive: true },
      { userId: 'second-operator', role: 'AGENT', isActive: true },
      { userId: 'shared-operator', role: 'AGENT_SHARED', isActive: true },
      { userId: 'manager', role: 'MANAGER', isActive: true },
      { userId: 'viewer', role: 'VIEWER', isActive: true },
      { userId: 'inactive', role: 'AGENT', isActive: false },
    ],
  }, {
    id: 'instance-sbc', userId: 'other-owner', unit: 'SBC', status: 'connected',
    assignmentMode: 'TEAM_QUEUE', members: [],
  }];
  conversation = {
    id: 'chat', instanceId: 'instance-osasco', status: 'waiting_response',
    assignedTo: 'default-operator', assignedToName: 'Responsável padrão',
    unreadCount: 3, reopenCount: 0,
  };
  effects = { claims: 0, pipelineReads: 0, deals: 0, clients: 0, auditUsers: [] };
  conversationReads = [];
  claimFilters = [];
  beforeClaim = null;
  afterRead = null;
});

function start({
  userId = 'operator', userName = 'Operadora', instanceId = 'instance-osasco',
  unit = 'Osasco', id = 'chat', body,
} = {}) {
  const headers = { 'Content-Type': 'application/json', 'x-user-role': 'VENDEDOR', 'x-user-unit': 'Osasco' };
  if (userId) Object.assign(headers, { 'x-user-id': userId, 'x-user-name': userName });
  return PATCH(new Request(
    `http://synthetic.invalid/api/whatsapp/conversations/${id}/reopen?targetInstanceId=${instanceId}&unit=${unit}`,
    { method: 'PATCH', headers, body: JSON.stringify(body ?? { assignedTo: userId, startService: true }) },
  ), { params: Promise.resolve({ id }) });
}

function assertNoEffects() {
  assert.deepEqual(effects, { claims: 0, pipelineReads: 0, deals: 0, clients: 0, auditUsers: [] });
}

test('Atendente inicia lead em espera pré-atribuído e mantém o escopo da instância', async () => {
  const response = await start();
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.conversation.assignedTo, 'operator');
  assert.equal(result.conversation.assignedToName, 'Operadora');
  assert.equal(result.conversation.status, 'open');
  assert.equal(result.conversation.unreadCount, 0);
  assert.equal(result.conversation.reopenCount, 1);
  assert.equal(result.pipelineTransition.status, 'moved');
  assert.deepEqual(conversationReads, [{ id: 'chat', instanceId: { in: ['instance-osasco'] } }]);
  assert.deepEqual(claimFilters, [{
    id: 'chat', instanceId: 'instance-osasco', assignedTo: 'default-operator', status: 'waiting_response',
  }]);
  assert.deepEqual(effects, { claims: 1, pipelineReads: 1, deals: 1, clients: 1, auditUsers: ['Operadora'] });
});

test('Atendente não toma atendimento ativo de outro operador', async () => {
  conversation.status = 'open';
  const response = await start();
  assert.equal(response.status, 409);
  assert.match((await response.json()).error, /atendimento por/);
  assertNoEffects();
});

test('Atendente compartilhado assume atendimento ativo sem poderes de gerente', async () => {
  conversation.status = 'open';
  const response = await start({ userId: 'shared-operator', userName: 'Atendente compartilhada' });
  assert.equal(response.status, 200);
  assert.equal(conversation.assignedTo, 'shared-operator');
  assert.equal(conversation.assignedToName, 'Atendente compartilhada');
  assert.deepEqual(claimFilters, [{ id: 'chat', instanceId: 'instance-osasco' }]);
  assert.deepEqual(effects, { claims: 1, pipelineReads: 0, deals: 0, clients: 0, auditUsers: [] });
});

test('mudança concorrente de responsável e status não trava o Atendente compartilhado', async () => {
  conversation.status = 'open';
  beforeClaim = () => {
    conversation.assignedTo = 'second-operator';
    conversation.status = 'closed';
  };
  assert.equal((await start({ userId: 'shared-operator' })).status, 200);
  assert.equal(conversation.assignedTo, 'shared-operator');
  assert.equal(conversation.status, 'open');
  assert.equal(effects.claims, 1);
  assert.equal(effects.pipelineReads, 0);
  assert.deepEqual(claimFilters, [{ id: 'chat', instanceId: 'instance-osasco' }]);
});

test('capacidade forjada no corpo não libera tomada por Atendente comum', async () => {
  conversation.status = 'open';
  const response = await start({ body: {
    assignedTo: 'operator', startService: true, canReplyAcrossAssignments: true,
  } });
  assert.equal(response.status, 409);
  assertNoEffects();
});

test('Atendente compartilhado continua restrito à associação, unidade e conversa autorizadas', async () => {
  for (const request of [{ unit: 'SBC' }, { instanceId: 'instance-sbc' }, { id: 'other-chat' }]) {
    assert.ok([403, 404].includes((await start({ userId: 'shared-operator', ...request })).status));
  }
  instances[0].members.find((member) => member.userId === 'shared-operator').isActive = false;
  assert.ok([403, 404].includes((await start({ userId: 'shared-operator' })).status));
  assertNoEffects();
});

test('reabertura simples não permite tomar lead atribuído a outro operador', async () => {
  for (const startService of [undefined, false, 'true']) {
    const response = await start({ body: { assignedTo: 'operator', startService } });
    assert.equal(response.status, 409);
  }
  assertNoEffects();
});

test('responsável atual e conversa sem responsável continuam iniciando normalmente', async () => {
  for (const assignedTo of ['operator', null]) {
    conversation.assignedTo = assignedTo;
    conversation.status = 'waiting_response';
    assert.equal((await start()).status, 200);
    assert.equal(conversation.assignedTo, 'operator');
  }
  assert.equal(effects.claims, 2);
});

test('gerente continua podendo assumir conversa ativa de outro operador', async () => {
  conversation.status = 'open';
  const response = await start({ userId: 'manager', userName: 'Gestora' });
  assert.equal(response.status, 200);
  assert.equal(conversation.assignedTo, 'manager');
  assert.equal(effects.claims, 1);
  assert.equal(effects.pipelineReads, 0);
});

test('consulta, associação inativa e usuário externo da mesma unidade não podem iniciar', async () => {
  for (const userId of ['viewer', 'inactive', 'outsider']) {
    const response = await start({ userId });
    assert.ok([403, 404].includes(response.status));
  }
  assert.equal(conversationReads.length, 0);
  assertNoEffects();
});

test('unidade divergente, outra instância e conversa fora do escopo permanecem bloqueadas', async () => {
  for (const request of [{ unit: 'SBC' }, { instanceId: 'instance-sbc' }, { id: 'other-chat' }]) {
    const response = await start(request);
    assert.ok([403, 404].includes(response.status));
  }
  conversation.instanceId = 'instance-sbc';
  assert.ok([403, 404].includes((await start()).status));
  assertNoEffects();
});

test('ausência de autenticação e identidade de atribuição forjada não produzem efeitos', async () => {
  assert.equal((await start({ userId: null })).status, 401);
  conversation.assignedTo = 'operator';
  const response = await start({ body: { assignedTo: 'third-person', startService: true } });
  assert.equal(response.status, 403);
  assertNoEffects();
});

test('mudança concorrente de responsável retorna conflito sem mover funil nem gravar auditoria', async () => {
  conversation.assignedTo = 'operator';
  beforeClaim = () => { conversation.assignedTo = 'second-operator'; };
  assert.equal((await start()).status, 409);
  assert.equal(conversation.assignedTo, 'second-operator');
  assertNoEffects();
});

test('mudança concorrente somente de status também impede a tomada de uma leitura antiga', async () => {
  conversation.assignedTo = 'operator';
  beforeClaim = () => { conversation.status = 'open'; };
  assert.equal((await start()).status, 409);
  assert.equal(conversation.status, 'open');
  assertNoEffects();
});

test('duas tomadas simultâneas permitem uma vencedora e nenhum efeito da perdedora', async () => {
  let arrived = 0;
  let release;
  const readsReady = new Promise((resolve) => { release = resolve; });
  afterRead = async () => {
    arrived++;
    if (arrived === 2) release();
    await readsReady;
  };
  const responses = await Promise.all([
    start(),
    start({ userId: 'second-operator', userName: 'Segunda operadora' }),
  ]);
  assert.deepEqual(responses.map((response) => response.status).sort(), [200, 409]);
  const winner = responses.findIndex((response) => response.status === 200);
  assert.equal(conversation.assignedTo, ['operator', 'second-operator'][winner]);
  assert.equal(conversation.reopenCount, 1);
  assert.deepEqual(effects, {
    claims: 1, pipelineReads: 1, deals: 1, clients: 1,
    auditUsers: [['Operadora', 'Segunda operadora'][winner]],
  });
});
