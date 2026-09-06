import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { list, del } from '@vercel/blob';

if (process.env.VERCEL_ENV !== 'production' || process.env.LEGACY_MODULE_CLEANUP_ON_DEPLOY !== 'confirmed-after-cutover') {
  throw new Error('Limpeza exclusiva do deploy administrativo após validar a versão publicada.');
}
const { prisma } = await import('../src/lib/db.ts');
const migration = 'prisma/migrations/20260906170000_retire_legacy_modules/migration.sql';
const targetNames = [...readFileSync(migration, 'utf8').matchAll(/public\."([^"\n]+)"/g)]
  .map(match => match[1]).filter(name => !['AppSetting', 'User'].includes(name));

try {
  const foreignKeys = await prisma.$queryRaw`
    SELECT source.relname AS source, target.relname AS target
    FROM pg_constraint c
    JOIN pg_class source ON source.oid = c.conrelid
    JOIN pg_class target ON target.oid = c.confrelid
    JOIN pg_namespace ns ON ns.oid = target.relnamespace
    WHERE c.contype = 'f' AND ns.nspname = 'public'`;
  const external = foreignKeys.filter(row => targetNames.includes(row.target) && !targetNames.includes(row.source));
  if (external.length) throw new Error(`Dependências externas: ${JSON.stringify(external)}`);

  // O prefixo é exclusivo dos materiais de treinamento. Verificar referências
  // operacionais antes de apagar qualquer objeto; nunca apagar o bucket inteiro.
  const blobs = [];
  let cursor;
  do {
    const page = await list({ prefix: 'ai-training/', limit: 1000, cursor });
    blobs.push(...page.blobs);
    cursor = page.hasMore ? page.cursor : undefined;
    if (blobs.length > 1000) throw new Error('Inventário maior que o limite de limpeza revisado.');
  } while (cursor);
  const referenced = await prisma.$queryRaw`
    SELECT EXISTS (
      SELECT 1 FROM "WhatsAppMessage" WHERE "mediaUrl" LIKE '%/ai-training/%' OR body LIKE '%/ai-training/%'
      UNION ALL SELECT 1 FROM "WhatsAppSavedReply" WHERE content LIKE '%/ai-training/%'
      UNION ALL SELECT 1 FROM "Flow" WHERE nodes::text LIKE '%/ai-training/%'
      UNION ALL SELECT 1 FROM "AppSetting" WHERE value LIKE '%/ai-training/%'
    ) AS found`;
  if (referenced[0]?.found) throw new Error('Material de treinamento referenciado pela operação; preservar e revisar antes de excluir.');
  console.log(JSON.stringify({ cleanup: 'validated', tables: targetNames.length, blobs: blobs.map(blob => blob.pathname) }));

  const result = spawnSync('npx', ['prisma', 'db', 'execute', '--file', migration, '--url', process.env.DATABASE_URL], {
    stdio: 'inherit', shell: false, env: process.env,
  });
  if (result.status !== 0) throw new Error('Migração não concluída; objetos de armazenamento preservados.');
  for (const blob of blobs) {
    if (!blob.pathname.startsWith('ai-training/')) throw new Error('Objeto fora do prefixo permitido.');
    await del(blob.url);
  }
  const remaining = await list({ prefix: 'ai-training/', limit: 1 });
  if (remaining.blobs.length) throw new Error('Ainda existem materiais exclusivos no armazenamento.');
  const tables = await prisma.$queryRaw`SELECT relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r'`;
  if (tables.some(row => targetNames.includes(row.relname))) throw new Error('Ainda existem tabelas retiradas.');
  const jobs = await prisma.$queryRaw`SELECT jobname FROM cron.job WHERE jobname='ai-inbox-scs-observer-every-15-minutes'`;
  if (jobs.length) throw new Error('Agendamento retirado ainda existe.');
  console.log(JSON.stringify({ cleanup: 'complete', tablesRemoved: targetNames.length, blobsRemoved: blobs.length, scheduledJobsRemaining: jobs.length }));
} finally { await prisma.$disconnect(); }
