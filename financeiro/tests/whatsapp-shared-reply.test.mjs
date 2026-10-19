import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';
import { registerHooks } from 'node:module';

// Rotas e ACL reais, com Prisma e provedor integralmente sintéticos.
const nextServerUrl = import.meta.resolve('next/server.js');
const modules = {
  'next/server': `export { NextResponse } from ${JSON.stringify(nextServerUrl)}; export function after(task){globalThis.sharedReplyAfterTasks.push(task)}`,
  '@/lib/whatsapp/callbacks': 'export async function recordOutboundForCallbackTracking(){return false}',
  '@/lib/whatsapp/media-storage': 'export const isPrivateBlobUrl=()=>false;export const signPrivateMediaUrls=async x=>x;export const inspectPrivateBlob=async()=>null;export const createPrivateBlobReadUrl=async x=>x;',
  '@/lib/whatsapp/link-preview': 'export const firstWhatsAppLink=()=>null;export const loadWhatsAppLinkPreview=async()=>null;',
  '@/lib/whatsapp/inbox-realtime': 'export async function broadcastInboxRealtimeChange(){}',
};
registerHooks({ resolve(specifier, context, next) {
  if (modules[specifier]) return { url: 'data:text/javascript,' + encodeURIComponent(modules[specifier]), shortCircuit: true };
  return next(specifier === 'next/server' ? 'next/server.js' : specifier, context);
} });

let instances, conversation, providerCalls, messageWrites, claimFilters, activity;
let beforeClaim, afterRead, providerFailure;
const matches = (where, record) => Object.entries(where).every(([key, value]) => record[key] === value);
const database = {
  whatsAppInstance: {
    findUnique: async ({ where }) => structuredClone(instances.find((item) => item.id === where.id) || null),
  },
  whatsAppConversation: {
    findFirst: async ({ where }) => {
      if (where.id !== conversation.id || !where.instanceId.in.includes(conversation.instanceId)) return null;
      const snapshot = structuredClone(conversation);
      await afterRead?.();
      return snapshot;
    },
    updateMany: async ({ where, data }) => {
      claimFilters.push(structuredClone(where));
      beforeClaim?.();
      beforeClaim = null;
      if (!matches(where, conversation)) return { count: 0 };
      Object.assign(conversation, data);
      return { count: 1 };
    },
    update: async ({ where, data }) => {
      assert.equal(where.id, conversation.id);
      Object.assign(conversation, data);
      return { ...structuredClone(conversation), callbackAttempts: [] };
    },
  },
  whatsAppMessage: {
    upsert: async ({ where, create }) => {
      assert.deepEqual(where, { conversationId_messageId: { conversationId: conversation.id, messageId: create.messageId } });
      const message = { id: `message-${messageWrites.length + 1}`, ...create };
      messageWrites.push(message);
      return message;
    },
    create: async ({ data }) => {
      const message = { id: `message-${messageWrites.length + 1}`, ...data };
      messageWrites.push(message);
      return message;
    },
  },
  activityLog: { create: async ({ data }) => { activity.push(data); return { id: `activity-${activity.length}` }; } },
  webhookLog: { create: async () => ({ id: 'synthetic-diagnostic' }) },
  $transaction: async (callback) => callback(database),
};
globalThis.prisma = database;
globalThis.fetch = async (url, options) => {
  assert.equal(options.method, 'POST');
  assert.match(new URL(url).pathname, /^\/message\/send(Text|Media|WhatsAppAudio)\/synthetic-osasco$/);
  providerCalls.push({ path: new URL(url).pathname, body: JSON.parse(options.body) });
  if (providerFailure === 'timeout') throw new Error('Synthetic provider timeout after accepting the request');
  if (providerFailure === 'http') return Response.json({ error: 'Synthetic provider failure' }, { status: 502 });
  return Response.json({ key: { id: `wa-${providerCalls.length}` }, status: 'SERVER_ACK' });
};

const { POST } = await import('../src/app/api/whatsapp/send/route.ts');
const { getInstancesForRequest } = await import('../src/lib/whatsapp/instance-resolver.ts');

beforeEach(() => {
  instances = [{
    id: 'instance-osasco', name: 'synthetic-osasco', userId: 'technical-owner',
    unit: 'Osasco', status: 'connected', provider: 'evolution', assignmentMode: 'DEFAULT_ASSIGNEE',
    members: [
      { userId: 'shared', role: 'AGENT_SHARED', isActive: true },
      { userId: 'ordinary', role: 'AGENT', isActive: true },
      { userId: 'viewer', role: 'VIEWER', isActive: true },
      { userId: 'inactive', role: 'AGENT_SHARED', isActive: false },
    ],
  }, {
    id: 'instance-sbc', name: 'synthetic-sbc', userId: 'another-owner',
    unit: 'SBC', status: 'connected', provider: 'evolution', members: [],
  }];
  conversation = {
    id: 'chat', instanceId: 'instance-osasco', status: 'open',
    assignedTo: 'aline', assignedToName: 'Aline', unreadCount: 2,
    contact: { id: 'contact', phone: '5511999999999', name: 'Contato sintético', unit: 'Osasco' },
  };
  providerCalls = []; messageWrites = []; claimFilters = []; activity = [];
  beforeClaim = null; afterRead = null; providerFailure = null;
  globalThis.sharedReplyAfterTasks = [];
});

function request({ userId = 'shared', instanceId = 'instance-osasco', unit = 'Osasco', id = 'chat', extra = {} } = {}) {
  return new Request(`http://synthetic.invalid/api/whatsapp/send?targetInstanceId=${instanceId}&unit=${unit}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-user-id': userId, 'x-user-name': 'Atendente real', 'x-user-role': 'VENDEDOR', 'x-user-unit': 'Osasco' },
    body: JSON.stringify({ conversationId: id, body: 'Resposta explícita', type: 'text', ...extra }),
  });
}

async function send(options) {
  const response = await POST(request(options));
  await Promise.all(globalThis.sharedReplyAfterTasks.splice(0).map((task) => task()));
  return response;
}

function assertNoSend() {
  assert.equal(providerCalls.length, 0);
  assert.equal(messageWrites.length, 0);
}

test('associação compartilhada concede resposta transversal sem gestão ou reconexão', async () => {
  const { instances: allowed } = await getInstancesForRequest(request());
  assert.equal(allowed.length, 1);
  assert.equal(allowed[0].accessRole, 'AGENT_SHARED');
  assert.equal(allowed[0].canReply, true);
  assert.equal(allowed[0].canReplyAcrossAssignments, true);
  assert.equal(allowed[0].canManage, false);
  assert.equal(allowed[0].canReconnect, false);
});

for (const type of ['text', 'image', 'ptt']) {
  test(`compartilhado responde ${type} em atendimento ativo de Aline uma única vez`, async () => {
    const extra = type === 'text' ? {} : {
      type, file: 'data:application/octet-stream;base64,dGVzdA==', docName: 'synthetic.bin',
    };
    const response = await send({ extra });
    assert.equal(response.status, 200);
    assert.equal(providerCalls.length, 1);
    assert.equal(messageWrites.length, 1);
    assert.equal(messageWrites[0].respondedBy, 'shared');
    assert.equal(messageWrites[0].respondedByName, 'Atendente real');
    assert.equal(conversation.assignedTo, 'shared');
    assert.deepEqual(claimFilters, [{ id: 'chat', instanceId: 'instance-osasco' }]);
  });
}

test('troca concorrente de responsável não causa 409 nem repetição no envio compartilhado', async () => {
  beforeClaim = () => { conversation.assignedTo = 'another-operator'; conversation.status = 'waiting_response'; };
  assert.equal((await send()).status, 200);
  assert.equal(providerCalls.length, 1);
  assert.equal(messageWrites.length, 1);
  assert.equal(conversation.assignedTo, 'shared');
  assert.deepEqual(claimFilters, [{ id: 'chat', instanceId: 'instance-osasco' }]);
});

test('conversa que sai da caixa autorizada antes da tomada não é enviada', async () => {
  beforeClaim = () => { conversation.instanceId = 'instance-sbc'; };
  assert.equal((await send()).status, 404);
  assertNoSend();
  assert.deepEqual(claimFilters, [{ id: 'chat', instanceId: 'instance-osasco' }]);
});

test('Atendente comum mantém conflito de responsável e nenhum envio externo', async () => {
  assert.equal((await send({ userId: 'ordinary' })).status, 409);
  assertNoSend();
  assert.equal(claimFilters.length, 0);
});

test('CAS do Atendente comum ainda barra mudança concorrente antes do provedor', async () => {
  conversation.assignedTo = 'ordinary';
  beforeClaim = () => { conversation.assignedTo = 'another-operator'; };
  assert.equal((await send({ userId: 'ordinary' })).status, 409);
  assertNoSend();
  assert.equal(claimFilters[0].assignedTo, 'ordinary');
});

test('consulta, associação inativa e usuário externo da mesma unidade não podem enviar', async () => {
  for (const userId of ['viewer', 'inactive', 'outsider']) {
    assert.ok([403, 404].includes((await send({ userId })).status));
  }
  assertNoSend();
  assert.equal(claimFilters.length, 0);
});

test('capacidade não atravessa unidade, caixa ou conversa autorizada', async () => {
  for (const options of [{ unit: 'SBC' }, { instanceId: 'instance-sbc' }, { id: 'other-chat' }]) {
    assert.ok([403, 404].includes((await send(options)).status));
  }
  conversation.instanceId = 'instance-sbc';
  assert.ok([403, 404].includes((await send()).status));
  assertNoSend();
});

test('capacidade ou papel forjados no corpo não ampliam o acesso do Atendente comum', async () => {
  const response = await send({ userId: 'ordinary', extra: {
    canReplyAcrossAssignments: true, canManage: true, role: 'AGENT_SHARED', assignedTo: 'shared',
  } });
  assert.equal(response.status, 409);
  assertNoSend();
});

for (const failure of ['http', 'timeout']) {
  test(`falha ${failure} do provedor não dispara reenvio automático`, async (t) => {
    t.mock.method(console, 'error', () => {});
    providerFailure = failure;
    const response = await send();
    assert.equal(response.status, failure === 'http' ? 502 : 500);
    assert.equal(providerCalls.length, 1);
    assert.equal(messageWrites.length, 0);
  });
}

test('dois pedidos explícitos concorrentes enviam uma vez cada, sem disputar propriedade', async () => {
  let reads = 0;
  let release;
  const bothRead = new Promise((resolve) => { release = resolve; });
  afterRead = async () => { if (++reads === 2) release(); await bothRead; };
  const responses = await Promise.all([
    send({ extra: { body: 'Primeira resposta' } }),
    send({ extra: { body: 'Segunda resposta' } }),
  ]);
  assert.deepEqual(responses.map((response) => response.status), [200, 200]);
  assert.equal(providerCalls.length, 2);
  assert.deepEqual(providerCalls.map((call) => call.body.text).sort(), ['Primeira resposta', 'Segunda resposta']);
  assert.equal(messageWrites.length, 2);
});

test('resposta compartilhada continua respeitando bloqueio e conexão da instância', async () => {
  conversation.blockedAt = new Date();
  assert.equal((await send()).status, 409);
  conversation.blockedAt = null;
  instances[0].status = 'disconnected';
  assert.equal((await send()).status, 409);
  assertNoSend();
});
