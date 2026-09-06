import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export function assertPreparationAccess(access, vectorSchema) {
  if (!access?.database_create || !access?.public_create || !access?.extensions_create || !access?.cron_usage) {
    throw new Error('Preparação exige conexão administrativa autorizada. Não altere permissões para contornar este bloqueio.');
  }
  if (vectorSchema && vectorSchema !== 'extensions') {
    throw new Error('Extensão vector já existe em outro schema; migração automática interrompida.');
  }
}

function run(args, input) {
  const result = spawnSync(process.execPath, args, {
    env: process.env,
    input,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  // Do not forward provider/Prisma errors: they may contain connection details.
  if (result.status !== 0) throw new Error('Preparação administrativa falhou; configuração não deve ser ativada.');
}

export async function prepare() {
  if (process.env.VERCEL_ENV !== 'production' || process.env.AI_INBOX_PREPARE_ON_DEPLOY !== 'true') {
    throw new Error('Preparação permitida apenas no deploy de produção explicitamente habilitado.');
  }
  if ((process.env.CRON_SECRET || '').length < 32) throw new Error('Credencial do agendador ausente ou inválida.');
  if (!process.env.OPENAI_API_KEY) throw new Error('Credencial da IA ausente.');
  // Resolve Node's package import through the same singleton used by the app.
  const { prisma } = await import('../src/lib/db.ts');
  try {
    const [access] = await prisma.$queryRaw`
      SELECT has_database_privilege(current_database(), 'CREATE') AS database_create,
             has_schema_privilege('public', 'CREATE') AS public_create,
             has_schema_privilege('extensions', 'CREATE') AS extensions_create,
             has_schema_privilege('cron', 'USAGE') AS cron_usage`;
    const vector = await prisma.$queryRaw`SELECT n.nspname AS schema FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace WHERE e.extname = 'vector'`;
    assertPreparationAccess(access, vector[0]?.schema);
    run(['--experimental-strip-types', 'scripts/setup-ai-inbox-scs.ts']);
    const migration = readFileSync(new URL('../prisma/migrations/20260906010000_ai_inbox_scs/migration.sql', import.meta.url), 'utf8');
    run(['node_modules/prisma/build/index.js', 'db', 'execute', '--stdin', '--url', process.env.DATABASE_URL], `BEGIN;\n${migration}\nCOMMIT;`);
    const tables = await prisma.$queryRaw`
      SELECT c.relname, c.relrowsecurity AS rls,
        (c.relowner = r.oid OR r.rolbypassrls OR r.rolsuper) AS bypass,
        has_table_privilege(c.oid, 'SELECT,INSERT,UPDATE,DELETE') AS access
      FROM pg_class c JOIN pg_roles r ON r.rolname = current_user
      WHERE c.relnamespace = 'public'::regnamespace AND c.relname IN ('AiInboxObservation','AiInboxKnowledge','AiInboxOperation')`;
    if (tables.length !== 3 || tables.some(t => !t.rls || !t.bypass || !t.access)) {
      throw new Error('Tabelas criadas, mas acesso do runtime precisa de validação administrativa.');
    }
    run(['--experimental-strip-types', 'scripts/setup-ai-inbox-scs.ts', '--apply']);
    console.log('[AI Inbox] Estrutura e job próprios preparados; nenhuma mensagem enviada.');
  } finally { await prisma.$disconnect(); }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  prepare().catch(() => {
    console.error('[AI Inbox] Preparação não concluída. Verifique permissões, schema e parâmetros; nenhum segredo será exibido.');
    process.exitCode = 1;
  });
}
