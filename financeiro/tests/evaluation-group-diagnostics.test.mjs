import assert from 'node:assert/strict';
import test, { after, beforeEach } from 'node:test';
import { registerHooks } from 'node:module';

registerHooks({ resolve(specifier, context, next) {
  return next(specifier === './evaluation-group-notice-config' ? `${specifier}.ts` : specifier, context);
} });
const { discoverEvaluationNoticeGroups, fetchEvaluationNoticeGroups } = await import('../src/lib/whatsapp/evaluation-group-directory.ts');
const originalUrl = process.env.EVOLUTION_API_URL;
const originalKey = process.env.EVOLUTION_API_KEY;
beforeEach(() => {
  process.env.EVOLUTION_API_URL = 'https://evolution.invalid///';
  process.env.EVOLUTION_API_KEY = 'synthetic-key-private';
});
after(() => {
  if (originalUrl === undefined) delete process.env.EVOLUTION_API_URL;
  else process.env.EVOLUTION_API_URL = originalUrl;
  if (originalKey === undefined) delete process.env.EVOLUTION_API_KEY;
  else process.env.EVOLUTION_API_KEY = originalKey;
});
const instanceName = 'synthetic-osasco';
const strict = { id: '120000000001@g.us', subject: 'Lead Osasco', size: 4, announce: false };
const phone = '11987654321';
const instances = () => [
  { name: 'other-instance-private', ownerJid: '5511999999999@s.whatsapp.net', profileName: 'other-profile-private' },
  { name: instanceName, ownerJid: `55${phone}@s.whatsapp.net`, profileName: 'target-profile-private', profilePicUrl: 'https://private.invalid/profile' },
];
function provider({ groups = [strict], instancePayload = instances(), phoneFailure, groupFailure } = {}) {
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push({ url, options });
    if (new URL(url).pathname.startsWith('/group/fetchAllGroups/')) {
      if (groupFailure) return groupFailure();
      return Response.json(groups);
    }
    assert.equal(new URL(url).pathname, '/instance/fetchInstances', 'não consulta endpoints adicionais');
    if (phoneFailure) return phoneFailure();
    return Response.json(instancePayload);
  };
  return { calls, fetcher };
}
const discover = (fetcher, name = instanceName, unit = 'Osasco') => discoverEvaluationNoticeGroups(name, fetcher, unit);

test('Osasco inicia exatamente dois GETs em paralelo, com cache bloqueado e prazo de 12s', async () => {
  const calls = [], waiters = [], timeouts = [];
  let released = false;
  const nativeTimeout = AbortSignal.timeout;
  AbortSignal.timeout = ms => { timeouts.push(ms); return nativeTimeout(ms); };
  const fake = (url, options) => {
    calls.push({ url, options });
    const payload = new URL(url).pathname.startsWith('/group/') ? [strict] : instances();
    return released ? Promise.resolve(Response.json(payload)) : new Promise(resolve => waiters.push(() => resolve(Response.json(payload))));
  };
  let result;
  try {
    const pending = discover(fake, 'caixa /?#');
    await new Promise(resolve => setImmediate(resolve));
    try { assert.equal(calls.length, 2, 'ambas chamadas começam antes da primeira resposta'); }
    finally { released = true; waiters.forEach(resolve => resolve()); }
    result = await pending;
  } finally { AbortSignal.timeout = nativeTimeout; }
  assert.equal(calls.length, 2);
  assert.deepEqual(timeouts, [12000, 12000]);
  assert.equal(calls.filter(call => new URL(call.url).pathname.startsWith('/group/fetchAllGroups/')).length, 1);
  assert.equal(calls.filter(call => new URL(call.url).pathname === '/instance/fetchInstances').length, 1);
  const groupCall = calls.find(call => new URL(call.url).pathname.startsWith('/group/'));
  const instanceCall = calls.find(call => new URL(call.url).pathname === '/instance/fetchInstances');
  assert.equal(groupCall.url, 'https://evolution.invalid/group/fetchAllGroups/caixa%20%2F%3F%23?getParticipants=false');
  assert.equal(new URL(instanceCall.url).searchParams.get('instanceName'), 'caixa /?#');
  for (const call of calls) {
    assert.ok(!call.options.method || call.options.method === 'GET');
    assert.equal(call.options.cache, 'no-store');
    assert.equal(call.options.redirect, 'error');
    assert.equal(call.options.headers.apikey, 'synthetic-key-private');
    assert.ok(call.options.signal instanceof AbortSignal);
    assert.equal(call.options.body, undefined);
  }
  assert.equal(result.groups.length, 1);
});

test('telefone vem somente da instância exata v2 ownerJid e os metadados privados não saem', async () => {
  const { fetcher } = provider();
  const result = await discover(fetcher);
  assert.equal(result.diagnostics.connectedPhone, phone);
  assert.equal(result.diagnostics.totalGroups, 1);
  assert.equal(result.diagnostics.groupsWithoutName, 0);
  assert.deepEqual(result.diagnostics.relatedGroups, []);
  assert.deepEqual(result.groups, [{ id: strict.id, name: strict.subject, size: 4, announce: false }]);
  assert.doesNotMatch(JSON.stringify(result), /other-instance|other-profile|target-profile|profilePic|owner|private\.invalid|5511999999999|synthetic-key/);
});

test('telefone legado aceita owner aninhado da instância exata sem pegar o primeiro registro', async () => {
  const payload = [{ instance: { instanceName: 'other', owner: '5511999999999@s.whatsapp.net' } },
    { instance: { instanceName, owner: `55${phone}@s.whatsapp.net`, profileName: 'private-profile' } }];
  const result = await discover(provider({ instancePayload: payload }).fetcher);
  assert.equal(result.diagnostics.connectedPhone, phone);
  assert.doesNotMatch(JSON.stringify(result), /5511999999999|private-profile|owner|instanceName/);
});

test('instância desconhecida, ambígua ou identificador não telefônico não usa fallback', async () => {
  const payloads = [
    [{ name: 'other', ownerJid: `55${phone}@s.whatsapp.net` }],
    [{ ownerJid: `55${phone}@s.whatsapp.net` }],
    [{ name: instanceName, ownerJid: '123456789@lid' }],
    [{ name: instanceName, ownerJid: '120363000009@g.us' }],
    [{ name: instanceName, ownerJid: 'https://private.invalid/5511987654321' }],
    [{ name: instanceName, ownerJid: `55${phone}@s.whatsapp.net` }, { name: instanceName, ownerJid: '5511999999999@s.whatsapp.net' }],
    [{ name: instanceName, instance: { instanceName: 'other' }, ownerJid: `55${phone}@s.whatsapp.net` }],
  ];
  for (const instancePayload of payloads) {
    const result = await discover(provider({ instancePayload }).fetcher);
    assert.equal(result.diagnostics.connectedPhone, null);
    assert.equal(result.diagnostics.phoneUnavailable, true);
    assert.equal(result.groups.length, 1);
    assert.doesNotMatch(JSON.stringify(result), /5511999999999|123456789@lid|120363000009@g\.us|private\.invalid/);
  }
});

test('envelope e registro nomeado preservam a mesma seleção exata, sem aceitar objetos anônimos', async () => {
  const target = { instanceName, ownerJid: `55${phone}:1@s.whatsapp.net` };
  for (const instancePayload of [{ instances: [target] }, target]) {
    const result = await discover(provider({ instancePayload }).fetcher);
    assert.equal(result.diagnostics.connectedPhone, phone);
  }
});

test('relacionados mostram somente variantes compactas previstas, nunca como escolhas de ativação', async () => {
  const payload = [
    { ...strict, participants: [{ id: 'private-participant' }], desc: 'private-description' },
    { id: '120000000002@g.us', subject: 'Lead\u200b Osasco', participants: ['private-participant'], owner: 'private-owner' },
    { id: '120000000003@g.us', subject: 'ＬＥＡＤＳ - ＯＳＡＳＣＯ', profilePicUrl: 'private-profile' },
    { id: '120000000004@g.us', subject: 'Leads Ósasço' },
    { id: '120000000005@g.us', subject: 'private-family-group' },
    { id: '120000000006@g.us', subject: 'Lead Osasco pacientes' },
    { id: '120000000007@g.us', subject: 'Leads SBC' },
    { id: '5511999999999@s.whatsapp.net', subject: 'Leads Osasco' },
    { id: strict.id, subject: 'Leads Osasco' },
    { id: '120000000008@g.us' }, { id: '120000000009@g.us', subject: '' }, { id: '120000000010@g.us', subject: 2 },
  ];
  const result = await discover(provider({ groups: payload }).fetcher);
  assert.deepEqual(result.groups.map(group => group.id), [strict.id]);
  assert.deepEqual(result.diagnostics.relatedGroups.map(group => group.id), ['120000000002@g.us', '120000000003@g.us', '120000000004@g.us']);
  assert.equal(result.diagnostics.totalGroups, payload.length);
  assert.equal(result.diagnostics.groupsWithoutName, 3);
  for (const group of result.diagnostics.relatedGroups) assert.deepEqual(Object.keys(group).sort(), ['announce', 'id', 'name', 'size']);
  assert.doesNotMatch(JSON.stringify(result), /participants|desc|owner|profile|private-|pacientes|Leads SBC|5511999999999/);
});

test('diagnóstico de variantes é limitado a dez JIDs distintos e nomes de até 200 caracteres', async () => {
  const groups = Array.from({ length: 30 }, (_, i) => ({ id: `12000000${1000 + i}@g.us`, subject: i % 2 ? 'Leads Osasco' : 'Lead\u200bOsasco' }));
  groups.unshift({ id: '120000009999@g.us', subject: 'Lead' + '\u200b'.repeat(210) + 'Osasco' });
  groups.push(groups[1]);
  const result = await discover(provider({ groups }).fetcher);
  assert.equal(result.groups.length, 0);
  assert.equal(result.diagnostics.relatedGroups.length, 10);
  assert.equal(new Set(result.diagnostics.relatedGroups.map(group => group.id)).size, 10);
  assert.ok(result.diagnostics.relatedGroups.every(group => group.name.length <= 200));
});

test('falha parcial da leitura do número preserva os grupos e não vaza erro HTTP/rede/JSON', async () => {
  for (const phoneFailure of [
    () => new Response('apikey=synthetic-key-private private-payload https://private.invalid', { status: 500 }),
    () => { throw new Error('synthetic-key-private private-payload https://private.invalid'); },
    () => new Response('{invalid-json-private'),
  ]) {
    const result = await discover(provider({ phoneFailure }).fetcher);
    assert.deepEqual(result.groups.map(group => group.id), [strict.id]);
    assert.equal(result.diagnostics.connectedPhone, null);
    assert.equal(result.diagnostics.phoneUnavailable, true);
    assert.doesNotMatch(JSON.stringify(result), /synthetic-key|private-payload|private\.invalid|invalid-json/);
  }
});

test('falha da consulta principal mantém erro sanitizado sem expor resposta ou credencial', async () => {
  for (const groupFailure of [
    () => new Response('private-payload synthetic-key-private https://private.invalid', { status: 500 }),
    () => { throw new Error('private-payload synthetic-key-private https://private.invalid'); },
    () => Response.json({ groups: [strict], private: 'private-payload' }),
    () => new Response('{private-invalid-json'),
  ]) {
    await assert.rejects(discover(provider({ groupFailure }).fetcher), error => {
      assert.doesNotMatch(error.message, /private-payload|synthetic-key|private\.invalid/);
      return true;
    });
  }
});

test('SBC discovery e configuração usam somente o GET original, sem diagnóstico extra', async () => {
  const sbc = { ...strict, subject: 'AVALIAÇOES SBC' };
  const discovery = provider({ groups: [sbc] });
  const result = await discoverEvaluationNoticeGroups('synthetic-sbc', discovery.fetcher, 'SBC');
  assert.equal(discovery.calls.length, 1);
  assert.equal(discovery.calls[0].options.redirect, undefined);
  assert.equal(result.diagnostics, undefined);
  const configure = provider();
  assert.equal((await fetchEvaluationNoticeGroups(instanceName, configure.fetcher, 'Osasco')).length, 1);
  assert.equal(configure.calls.length, 1);
  assert.equal(configure.calls[0].options.redirect, undefined);
});
