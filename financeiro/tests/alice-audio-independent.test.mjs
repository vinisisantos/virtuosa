import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { database } from './fixtures/alice-autonomy-database.mjs';
import { ALICE_AUTONOMY_INSTANCE_ID as instanceId } from '../src/lib/ai-assistant/autonomy/policy.ts';
globalThis.prisma = {};
registerHooks({ resolve(specifier, context, next) {
  if (specifier.startsWith('.') && context.parentURL?.startsWith('file:')) {
    const path = new URL(`${specifier}.ts`, context.parentURL);
    if (existsSync(path)) return next(path.href, context);
  }
  return next(specifier, context);
} });
const audio = await import('../src/lib/alice/audio/independent.ts');
const { projectAliceAudioHistory, aliceAudioTranscripts } = await import('../src/lib/alice/audio/history.ts');
const fixtureBytes = readFileSync(new URL('./fixtures/alice-audio-synthetic.ogg', import.meta.url));

test('áudios de entrada e saída em Manual são transcritos uma vez sem retomar nem enviar', async () => {
  assert.equal(typeof audio.prepareIndependentAliceAudio, 'function');
  for (const fromMe of [false, true]) {
    const f = await database();
    try {
      await f.pg.query('INSERT INTO "WhatsAppInstance" (id,unit) VALUES ($1,\'SBC\')', [instanceId]);
      await f.pg.query('INSERT INTO "WhatsAppConversation" (id,"instanceId","aiMode","aiModeUpdatedBy") VALUES (\'manual-audio\',$1,\'manual\',\'human-takeover\')', [instanceId]);
      await f.pg.query('INSERT INTO "WhatsAppMessage" (id,"conversationId","messageId",type,"fromMe","mediaUrl") VALUES (\'voice\',\'manual-audio\',\'provider-voice\',\'audio\',$1,$2)', [fromMe, 'https://fixture.private.blob.vercel-storage.com/whatsapp/manual-audio/recording.ogg']);
      await f.pg.query('UPDATE "AppSetting" SET value=$1 WHERE key=\'alice_audio_sbc_v1\'', [JSON.stringify({ enabled: true, allDirectionsActivatedAt: new Date(Date.now() - 60000).toISOString() })]);
      let calls = 0;
      const deps = { readAudio: async () => fixtureBytes, transcribe: async () => { calls++; return { text: 'Podemos conversar na segunda à tarde.', languages: [{ code: 'pt' }] }; }, notify: async () => {} };
      const params = { conversationId: 'manual-audio', instanceId, providerMessageId: 'provider-voice' };
      assert.equal(await audio.prepareIndependentAliceAudio(params, f.adapter, new Date(), deps), 'prepared');
      assert.equal(await audio.prepareIndependentAliceAudio(params, f.adapter, new Date(), deps), 'ready');
      assert.equal(calls, 1);
      const projected = await projectAliceAudioHistory([{ id: 'voice', conversationId: 'manual-audio', type: 'audio', body: '', fromMe, status: 'sent' }], 'manual-audio', instanceId, f.adapter);
      assert.equal(projected[0].audioTranscribed, true);
      assert.equal(projected[0].fromMe, fromMe);
      assert.equal((await aliceAudioTranscripts('conversation-b', instanceId, ['voice'], f.adapter)).size, 0);
      const chat = (await f.pg.query('SELECT "aiMode","aiModeUpdatedBy" FROM "WhatsAppConversation" WHERE id=\'manual-audio\'')).rows[0];
      assert.deepEqual(chat, { aiMode: 'manual', aiModeUpdatedBy: 'human-takeover' });
      assert.equal((await f.pg.query('SELECT COUNT(*)::int n FROM "AliceAutonomousTurn"')).rows[0].n, 0);
      assert.equal((await audio.prepareIndependentAliceAudio({ ...params, instanceId: 'instance-b' }, f.adapter, new Date(), deps)), 'ignored');
    } finally { await f.pg.close(); }
  }
});

test('saída do CRM usa job durável deduplicado e não enfileira outra caixa ou mensagem textual', async () => {
  const jobs = new Map();
  const db = { whatsAppInboundPostProcessJob: { upsert: async ({ create }) => {
    const key = `${create.instanceId}:${create.messageId}`;
    if (!jobs.has(key)) jobs.set(key, create);
  } } };
  const params = { conversationId: 'manual-audio', instanceId, providerMessageId: 'sent-voice', type: 'audio' };
  await audio.enqueueSentAliceAudio(params, db);
  await audio.enqueueSentAliceAudio(params, db);
  await audio.enqueueSentAliceAudio({ ...params, type: 'text' }, db);
  await audio.enqueueSentAliceAudio({ ...params, instanceId: 'other' }, db);
  assert.equal(jobs.size, 1);
  const job = [...jobs.values()][0];
  assert.equal(job.payload.audioTranscriptOnly, true);
  assert.deepEqual(job.payload.message, {});
});
