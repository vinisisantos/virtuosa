import { prisma } from "../src/lib/db.ts";

const jobName = "ai-learning-sbc-hourly";

async function main() {
  const jobs = await prisma.$queryRaw`SELECT jobid FROM cron.job WHERE jobname = ${jobName}`;
  for (const job of jobs) {
    await prisma.$queryRaw`SELECT cron.unschedule(${job.jobid})`;
  }
  const remaining = await prisma.$queryRaw`SELECT jobid, active FROM cron.job WHERE jobname = ${jobName}`;
  if (remaining.some((job) => job.active)) throw new Error("O observador antigo da IA ainda está ativo.");
  console.log("Observador antigo da IA desativado; dados de revisão foram preservados.");
}

main().catch(() => {
  console.error("Não foi possível desativar o observador antigo da IA.");
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
