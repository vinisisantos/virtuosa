import { prisma } from "../src/lib/db";

const JOB_NAME = "whatsapp-callbacks-every-15-minutes";
const CRON_EXPRESSION = "*/15 * * * *";

function sqlLiteral(value: string) {
  return value.replace(/'/g, "''");
}

async function main() {
  const secret = (process.env.CRON_SECRET || "").trim();
  const callbackUrl = (process.env.CRON_CALLBACK_URL || "https://clinicasgestao.com.br/api/cron/whatsapp-callbacks").trim();

  if (secret.length < 32) throw new Error("CRON_SECRET ausente ou muito curto");
  if (!callbackUrl.startsWith("https://")) throw new Error("CRON_CALLBACK_URL precisa usar HTTPS");

  await prisma.$executeRawUnsafe('CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog');
  await prisma.$executeRawUnsafe('CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions');
  await prisma.$executeRawUnsafe(`
    SELECT cron.unschedule(jobid)
    FROM cron.job
    WHERE jobname = '${JOB_NAME}'
  `);

  const command = `
    SELECT net.http_post(
      url := '${sqlLiteral(callbackUrl)}',
      headers := '{"Content-Type":"application/json","Authorization":"Bearer ${sqlLiteral(secret)}"}'::jsonb,
      body := '{}'::jsonb
    );
  `;

  await prisma.$executeRawUnsafe(
    `SELECT cron.schedule('${JOB_NAME}', '${CRON_EXPRESSION}', $job$${command}$job$)`,
  );

  const jobs = await prisma.$queryRawUnsafe<Array<{ jobname: string; schedule: string; active: boolean }>>(`
    SELECT jobname, schedule, active
    FROM cron.job
    WHERE jobname = '${JOB_NAME}'
  `);
  if (jobs.length !== 1 || !jobs[0].active) throw new Error("O agendamento não ficou ativo");

  console.log(`${jobs[0].jobname}: ${jobs[0].schedule} ativo`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
