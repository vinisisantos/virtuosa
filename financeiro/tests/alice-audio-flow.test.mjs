import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { runnerFixture } from './fixtures/alice-autonomy-runner.mjs';
import { claimAliceAutonomousTurn } from '../src/lib/ai-assistant/autonomy/queue.ts';
globalThis.prisma = {};
globalThis.fetch = async () => { throw new Error('Rede externa proibida'); };
registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'server-only') return { url: 'data:text/javascript,export {};', shortCircuit: true };
  if (specifier === '@/generated/alice-knowledge') return { url: new URL('./fixtures/alice-test-knowledge.mjs', import.meta.url).href, shortCircuit: true };
  if (specifier.startsWith('.') && context.parentURL?.startsWith('file:')) {
    const source = new URL(`${specifier}.ts`, context.parentURL);
    if (existsSync(source)) return next(source.href, context);
  }
  return next(['next/server', 'next/headers'].includes(specifier) ? `${specifier}.js` : specifier, context);
} });
const { prepareAliceAudioTurn } = await import('../src/lib/alice/audio/prepare.ts');
const { loadAliceAutonomousContext } = await import('../src/lib/ai-assistant/autonomy/context.ts');
const { processAliceAutonomousTurn } = await import('../src/lib/ai-assistant/autonomy/runner.ts');
const { pauseAliceForHuman } = await import('../src/lib/ai-assistant/autonomy/queue.ts');
const { recoverAliceAutonomousTurns } = await import('../src/lib/ai-assistant/autonomy/queue.ts');
const { selectSbcSchedulingExchange } = await import('../src/lib/ai-assistant/sbc-scheduling-exchange.ts');
const { aliceAudioTranscripts } = await import('../src/lib/alice/audio/history.ts');
const { readAlicePrivateAudio, inspectAliceAudio } = await import('../src/lib/alice/audio/media.ts');
const { transcribeAliceAudio } = await import('../src/lib/alice/audio/provider.ts');

function wav(seconds = 1) {
  const bytes = Buffer.alloc(44 + 8000 * 2 * seconds);
  bytes.write('RIFF'); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(8000, 24); bytes.writeUInt32LE(16000, 28);
  bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34); bytes.write('data', 36); bytes.writeUInt32LE(bytes.length - 44, 40);
  return bytes;
}

async function fixture() {
  const f = await runnerFixture(claimAliceAutonomousTurn, { memory: true });
  await f.pg.exec(readFileSync(new URL('../prisma/migrations/20261109180000_alice_audio_transcription/migration.sql', import.meta.url), 'utf8'));
  await f.pg.query(`UPDATE "AppSetting" SET value=$1 WHERE key='alice_audio_sbc_v1'`, [JSON.stringify({ enabled: true, activatedAt: new Date(f.state.clock.getTime() - 60000).toISOString() })]);
  await f.pg.exec(`UPDATE "WhatsAppMessage" SET type='audio',body='',"mediaMimeType"='audio/wav',"mediaUrl"='https://fixture.private.blob.vercel-storage.com/whatsapp/conversation-a/inbound/source-a' WHERE id='source-a'`);
  const state = { requests: 0 };
  const dependencies = { readAudio: async () => wav(), transcribe: async () => {
    state.requests++; return { text: 'Vim pelo LIPO LASER e quero tratar o abdômen.', languages: [{ code: 'pt' }] };
  } };
  return { ...f, audio: state, dependencies };
}

test('áudio novo de SBC vira contexto privado reutilizável, sem alterar a mensagem original', async () => {
  const f = await fixture(); process.env.ALICE_CONVERSATION_MEMORY_SBC_ENABLED = 'true';
  try {
    assert.equal(await prepareAliceAudioTurn(f.claim.turn, f.adapter, f.state.clock, f.dependencies), 'prepared');
    assert.equal(await prepareAliceAudioTurn(f.claim.turn, f.adapter, f.state.clock, f.dependencies), 'ready');
    const context = await loadAliceAutonomousContext(f.claim.turn, f.adapter, f.state.clock);
    assert.equal(context.handoffReason, null);
    assert.match(JSON.stringify(context.prompt), /quero tratar o abdômen/);
    assert.equal(context.source.id, 'source-a');
    assert.equal(f.audio.requests, 1);
    const original = await f.adapter.whatsAppMessage.findFirst({ where: { id: 'source-a' } });
    assert.equal(original.type, 'audio'); assert.equal(original.body, '');
    assert.deepEqual(f.state.sends, []);
  } finally { delete process.env.ALICE_CONVERSATION_MEMORY_SBC_ENABLED; await f.pg.close(); }
});

test('áudio fora de limite ou sem compreensão vai para equipe sem geração nem repetição paga', async () => {
  for (const failure of ['size', 'duration', 'silence', 'timeout']) {
    const f = await fixture();
    try {
      if (failure === 'size') f.dependencies.readAudio = async () => new Uint8Array(8 * 1024 * 1024 + 1);
      if (failure === 'duration') f.dependencies.readAudio = async () => wav(301);
      if (failure === 'silence') f.dependencies.transcribe = async () => { f.audio.requests++; return { text: '', languages: [] }; };
      if (failure === 'timeout') f.dependencies.transcribe = async () => { f.audio.requests++; throw new Error('api timeout with sensitive body'); };
      const deps = { ...f.deps, prepareAudio: (turn, db, now) => prepareAliceAudioTurn(turn, db, now, f.dependencies) };
      assert.equal(await processAliceAutonomousTurn(f.claim, {}, deps), 'needs_human', failure);
      await prepareAliceAudioTurn(f.claim.turn, f.adapter, f.state.clock, f.dependencies);
      assert.equal(f.audio.requests, ['silence', 'timeout'].includes(failure) ? 1 : 0);
      assert.equal(f.state.generations, 0); assert.deepEqual(f.state.sends, []);
    } finally { await f.pg.close(); }
  }
});

test('pausa humana durante transcrição impede qualquer resposta e conserva apenas a transcrição privada', async () => {
  const f = await fixture();
  try {
    f.dependencies.transcribe = async () => {
      await pauseAliceForHuman('conversation-a', f.adapter);
      return { text: 'Quero saber do Lipo Laser.', languages: [{ code: 'pt' }] };
    };
    const deps = { ...f.deps, prepareAudio: (turn, db, now) => prepareAliceAudioTurn(turn, db, now, f.dependencies) };
    assert.equal(await processAliceAutonomousTurn(f.claim, {}, deps), 'skipped');
    assert.deepEqual(f.state.sends, []); assert.equal(f.state.generations, 0);
  } finally { await f.pg.close(); }
});

test('não transcreve mídia antiga nem de outra instância ou após desligar a ativação', async () => {
  for (const scenario of ['old', 'other', 'disabled']) {
    const f = await fixture();
    try {
      if (scenario === 'old') await f.pg.exec(`UPDATE "WhatsAppMessage" SET timestamp=NOW()-interval '2 days',"createdAt"=NOW()-interval '2 days' WHERE id='source-a'`);
      if (scenario === 'disabled') await f.pg.exec(`UPDATE "AppSetting" SET value='{"enabled":false}' WHERE key='alice_audio_sbc_v1'`);
      const turn = scenario === 'other' ? { ...f.claim.turn, instanceId: 'instance-b' } : f.claim.turn;
      assert.equal(await prepareAliceAudioTurn(turn, f.adapter, f.state.clock, f.dependencies), scenario === 'other' ? 'ready' : 'review');
      assert.equal(f.audio.requests, 0);
    } finally { await f.pg.close(); }
  }
});

test('escolha por voz conserva a fonte interna e permite agendar somente com transcrição verificada', async () => {
  const f = await fixture();
  try {
    const offerTime = new Date(f.state.clock.getTime() - 40000);
    await f.pg.query(`INSERT INTO "WhatsAppMessage" (id,"conversationId","messageId","fromMe",body,status,timestamp)
      VALUES ('offer','conversation-a','offer',TRUE,'Na quarta-feira (11/11/2026) temos 13h, 13h30 ou 14h. Qual prefere?','sent',$1)`, [offerTime]);
    f.dependencies.transcribe = async () => ({ text: 'Quarta às 14h', languages: [{ code: 'pt' }] });
    assert.equal(await prepareAliceAudioTurn(f.claim.turn, f.adapter, f.state.clock, f.dependencies), 'prepared');
    const context = await loadAliceAutonomousContext(f.claim.turn, f.adapter, f.state.clock);
    const choice = selectSbcSchedulingExchange(context.messages, new Date('2026-11-09T15:00:00Z'));
    assert.equal(choice.reply.id, 'source-a'); assert.equal(choice.slot, '2026-11-11T14:00');
    assert.equal(selectSbcSchedulingExchange(context.messages.map((m) => ({ ...m, audioTranscribed: false }))).slot, null);
  } finally { await f.pg.close(); }
});

test('repetição simultânea não transcreve duas vezes e leitura de outra conversa/caixa não revela conteúdo', async () => {
  const f = await fixture();
  try {
    const results = await Promise.all([prepareAliceAudioTurn(f.claim.turn, f.adapter, f.state.clock, f.dependencies),
      prepareAliceAudioTurn(f.claim.turn, f.adapter, f.state.clock, f.dependencies)]);
    assert.equal(results.filter(result => result === 'prepared').length, 1);
    assert.equal(f.audio.requests, 1);
    assert.equal((await aliceAudioTranscripts('conversation-b', f.claim.turn.instanceId, ['source-a'], f.adapter)).size, 0);
    assert.equal((await aliceAudioTranscripts('conversation-a', 'instance-b', ['source-a'], f.adapter)).size, 0);
    await f.pg.exec(`UPDATE "WhatsAppMessage" SET status='deleted' WHERE id='source-a'`);
    assert.equal((await aliceAudioTranscripts('conversation-a', f.claim.turn.instanceId, ['source-a'], f.adapter)).size, 0);
  } finally { await f.pg.close(); }
});

test('mídia privada correta e duração real Ogg/Opus são exigidas antes de chamar o fornecedor', async () => {
  for (const mediaUrl of ['http://127.0.0.1/private', 'https://example.com/audio.ogg',
    'https://fixture.private.blob.vercel-storage.com/whatsapp/other/inbound/source-a']) {
    await assert.rejects(readAlicePrivateAudio({ id: 'source-a', conversationId: 'conversation-a', mediaUrl, mediaSizeBytes: null }), /audio_private_media_unavailable/);
  }
  const bytes = readFileSync(new URL('./fixtures/alice-audio-synthetic.ogg', import.meta.url));
  const media = await inspectAliceAudio(bytes);
  assert.ok(media.durationMs > 3000 && media.durationMs < 15000);
  assert.equal(media.file.name, 'audio.ogg');
});

test('OpenAI recebe somente áudio e idiomas, com segredo server-side e sem repetição em erro HTTP', async () => {
  const previousKey = process.env.OPENAI_API_KEY, previousFetch = globalThis.fetch;
  process.env.OPENAI_API_KEY = 'synthetic-key-not-a-secret';
  let count = 0;
  globalThis.fetch = async (url, options) => {
    count++;
    assert.equal(url, 'https://api.openai.com/v1/audio/transcriptions');
    assert.equal(options.headers.Authorization, 'Bearer synthetic-key-not-a-secret');
    assert.equal(options.body.get('model'), 'gpt-transcribe');
    assert.equal(options.body.get('languages[]'), 'pt');
    assert.equal(options.body.has('language'), false);
    return new Response('{}', { status: 429 });
  };
  try {
    await assert.rejects(transcribeAliceAudio(new File([wav()], 'audio.wav')), /audio_provider_http_429/);
    assert.equal(count, 1);
  } finally { globalThis.fetch = previousFetch; if (previousKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previousKey; }
});

test('worker interrompido encerra o indicador de transcrição e exige equipe, sem reexecutar inferência', async () => {
  const f = await fixture();
  try {
    await f.pg.query(`INSERT INTO "AliceAudioTranscript" ("messageId","conversationId","instanceId","createdAt")
      VALUES ('source-a','conversation-a',$1,NOW()-interval '3 minutes')`, [f.claim.turn.instanceId]);
    await f.pg.exec(`UPDATE "AliceAutonomousTurn" SET "claimedAt"=NOW()-interval '3 minutes' WHERE id='turn-a'`);
    await recoverAliceAutonomousTurns(f.adapter, f.state.clock);
    const transcripts = await aliceAudioTranscripts('conversation-a', f.claim.turn.instanceId, ['source-a'], f.adapter);
    assert.equal(transcripts.get('source-a').status, 'failed');
    await prepareAliceAudioTurn(f.claim.turn, f.adapter, f.state.clock, f.dependencies);
    assert.equal(f.audio.requests, 0);
  } finally { await f.pg.close(); }
});
