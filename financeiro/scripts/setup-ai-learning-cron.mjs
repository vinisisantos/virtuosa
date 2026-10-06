import { prisma } from "../src/lib/db.ts";
import {
  AI_LEARNING_CRON_JOB,
  aiLearningDispatchCommand,
  cronSqlLiteral,
} from "../src/lib/ai-learning/cron.ts";

async function main() {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || secret.length < 32) throw new Error("CRON_SECRET ausente");
  const [permissions] = await prisma.$queryRaw`SELECT
    has_schema_privilege(current_user, 'cron', 'USAGE') AS cron,
    has_schema_privilege(current_user, 'net', 'USAGE') AS net`;
  if (!permissions?.cron || !permissions?.net) {
    throw new Error("Requer administrador do Supabase");
  }
  const command = aiLearningDispatchCommand(secret);
  await prisma.$executeRawUnsafe(
    `SELECT cron.schedule(${cronSqlLiteral(AI_LEARNING_CRON_JOB)}, '7 * * * *', ${cronSqlLiteral(command)})`,
  );
  const jobs = await prisma.$queryRaw`SELECT jobname, schedule, active FROM cron.job WHERE jobname = ${AI_LEARNING_CRON_JOB}`;
  if (jobs.length !== 1 || jobs[0].schedule !== "7 * * * *" || !jobs[0].active) {
    throw new Error("Agendador do aprendizado não ficou ativo");
  }
  console.log("Aprendizado supervisionado de SBC provisionado para lotes horários.");
}

main().catch(() => {
  console.error("Falha ao provisionar o aprendizado supervisionado. Nenhum grant foi alterado.");
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
