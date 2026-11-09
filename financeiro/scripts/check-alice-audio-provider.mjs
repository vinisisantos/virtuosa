import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { prisma } from '../src/lib/db.ts';
import { transcribeAliceAudio } from '../src/lib/alice/audio/provider.ts';

// Áudio sintético Luciana/pt-BR, sem dados de clientes. O teste não chama o WhatsApp.
const key = 'alice_audio_provider_check_v1';
async function main() {
  if (!process.env.OPENAI_API_KEY?.trim()) throw new Error('audio_provider_unconfigured');
  const bytes = await readFile(new URL('../tests/fixtures/alice-audio-synthetic.ogg', import.meta.url));
  const fingerprint = createHash('sha256').update('gpt-transcribe:v1:').update(bytes).update(process.env.OPENAI_API_KEY.trim()).digest('hex');
  const existing = await prisma.appSetting.findUnique({ where: { key }, select: { value: true } });
  try {
    const previous = JSON.parse(existing?.value || '{}');
    if (previous.passed === true && previous.fingerprint === fingerprint) {
      console.log('Alice áudio: teste sintético já validado para esta credencial e versão.'); return;
    }
  } catch {}
  const result = await transcribeAliceAudio(new File([bytes], 'synthetic.ogg', { type: 'audio/ogg' }));
  const normalized = result.text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
  if (!result.languages.some(item => item.code === 'pt') || !/avaliacao/.test(normalized)
    || !/quarta/.test(normalized) || !/(?:quatorze|catorze|14)/.test(normalized)) throw new Error('audio_provider_smoke_failed');
  const value = JSON.stringify({ passed: true, model: 'gpt-transcribe', fingerprint, checkedAt: new Date().toISOString() });
  await prisma.appSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
  console.log('Alice áudio: transcrição sintética Ogg/Opus em português validada; nenhum cliente ou mensagem alterado.');
}
main().catch(error => {
  console.error(/^audio_[a-z_\d]+$/.test(error?.message || '') ? error.message : 'audio_provider_check_failed');
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
