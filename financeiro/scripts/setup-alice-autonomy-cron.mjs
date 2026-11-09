import { prisma } from "../src/lib/db.ts";
import { ALICE_AUTONOMY_CRON_JOB, aliceAutonomyDispatchCommand } from "../src/lib/ai-assistant/autonomy/scheduler.ts";

const literal = (value) => `'${value.replaceAll("'", "''")}'`;
async function main() {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || secret.length < 32) throw new Error("CRON_SECRET ausente.");
  const [permissions] = await prisma.$queryRaw`SELECT has_schema_privilege(current_user,'cron','USAGE') AS cron, has_schema_privilege(current_user,'net','USAGE') AS net`;
  if (!permissions?.cron || !permissions?.net) throw new Error("Permissões cron/pg_net ausentes.");
  await prisma.$executeRawUnsafe(`SELECT cron.schedule(${literal(ALICE_AUTONOMY_CRON_JOB)}, '10 seconds', ${literal(aliceAutonomyDispatchCommand(secret))})`);
  const jobs = await prisma.$queryRaw`SELECT schedule,active FROM cron.job WHERE jobname=${ALICE_AUTONOMY_CRON_JOB}`;
  if (jobs.length !== 1 || !jobs[0].active || jobs[0].schedule !== "10 seconds") throw new Error("Agendador não provisionado.");
  console.log("Agendador da Alice provisionado; a autorização de envio não foi alterada.");
}
main().catch(() => {
  console.error("Falha ao provisionar agendador da Alice. Nenhum grant ou flag de ativação foi alterado.");
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
