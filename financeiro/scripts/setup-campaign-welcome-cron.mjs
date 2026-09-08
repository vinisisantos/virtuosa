import { createHash } from 'node:crypto';
import { prisma } from '../src/lib/db.ts';
import { EVALUATION_SCHEDULE_UNIT_CONFIGS } from '../src/lib/whatsapp/evaluation-schedule-confirmation-message.ts';
import { CAMPAIGN_WELCOME_TRIGGER, DEFAULT_WELCOME_GREETING, DEFAULT_WELCOME_REPLIES, WELCOME_LIBRARY_USER_ID, WELCOME_SCHEDULER_KEY } from '../src/lib/whatsapp/campaign-welcome-policy.ts';
import { WELCOME_CRON_JOB, cronSqlLiteral as literal, welcomeDispatchCommand } from '../src/lib/whatsapp/campaign-welcome-cron.ts';

// Somente no fluxo administrativo de implantação; nunca no webhook.
const jobName = WELCOME_CRON_JOB;
async function main() {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || secret.length < 32) throw new Error('CRON_SECRET ausente.');
  const [permissions] = await prisma.$queryRaw`SELECT has_schema_privilege(current_user, 'cron', 'USAGE') AS cron,
    has_schema_privilege(current_user, 'net', 'USAGE') AS net`;
  if (!permissions?.cron || !permissions?.net) throw new Error('Requer administrador do Supabase. Nenhum grant será alterado.');
  const owner = await prisma.user.findUnique({ where: { id: WELCOME_LIBRARY_USER_ID }, select: { id: true } });
  if (!owner) throw new Error('Biblioteca aprovada não localizada.');
  const secretHash = createHash('sha256').update(secret).digest('hex');
  await prisma.$transaction(async (tx) => {
    for (const config of EVALUATION_SCHEDULE_UNIT_CONFIGS) {
      await tx.automation.upsert({ where: { id: `${CAMPAIGN_WELCOME_TRIGGER}:${config.unit}` }, update: {}, create: {
        id: `${CAMPAIGN_WELCOME_TRIGGER}:${config.unit}`, name: `Recepção por campanha — ${config.unit}`,
        description: 'Novos leads: aguarda 1 minuto, envia saudação e pergunta da campanha. Biblioteca da Claudenice.',
        triggerType: CAMPAIGN_WELCOME_TRIGGER, unit: config.unit, isActive: true, createdBy: 'Sistema · autorizado por Vinicius',
        triggerConfig: { libraryUserId: WELCOME_LIBRARY_USER_ID, greeting: DEFAULT_WELCOME_GREETING, replyIds: DEFAULT_WELCOME_REPLIES },
        steps: [{ type: 'wait', config: { seconds: 60 } }, { type: 'send_message', config: { message: DEFAULT_WELCOME_GREETING } }],
      } });
    }
    const old = await tx.appSetting.findUnique({ where: { key: WELCOME_SCHEDULER_KEY } });
    const state = old ? JSON.parse(old.value) : {};
    await tx.appSetting.upsert({ where: { key: WELCOME_SCHEDULER_KEY }, create: {
      key: WELCOME_SCHEDULER_KEY, value: JSON.stringify({ installedAt: new Date().toISOString(), secretHash, readyAt: null }),
    }, update: state.secretHash === secretHash && state.readyAt ? {} : { value: JSON.stringify({ ...state, installedAt: new Date().toISOString(), secretHash, readyAt: null }) } });
    const command = welcomeDispatchCommand(secret);
    await tx.$executeRawUnsafe(`SELECT cron.schedule(${literal(jobName)}, '15 seconds', ${literal(command)})`);
    // Retenção somente destes dois jobs, sem tocar no histórico dos demais módulos.
    const cleanup = `DELETE FROM cron.job_run_details WHERE jobid IN (SELECT jobid FROM cron.job WHERE jobname IN ('${jobName}', '${jobName}-retention')) AND start_time < now() - interval '7 days'`;
    await tx.$executeRawUnsafe(`SELECT cron.schedule('${jobName}-retention', '20 6 * * *', ${literal(cleanup)})`);
  }, { timeout: 30_000 });
  const jobs = await prisma.$queryRaw`SELECT jobname, schedule, active FROM cron.job WHERE jobname = ${jobName}`;
  if (jobs.length !== 1 || jobs[0].schedule !== '15 seconds' || !jobs[0].active) throw new Error('Agendador não ficou ativo.');
  console.log('Recepção provisionada; ativação aguarda o primeiro worker autenticado após o deploy.');
}
main().catch(() => {
  // Erros Prisma podem incluir SQL com o segredo do cron: não imprimir o erro bruto.
  console.error('Falha ao provisionar recepção. Verifique CRON_SECRET e a permissão administrativa cron/pg_net do papel de implantação. Nenhum grant foi alterado.');
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
