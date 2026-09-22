import { prisma } from "../src/lib/db.ts";
import {
  INBOUND_POSTPROCESS_CRON_JOB,
  inboundPostProcessDispatchCommand,
} from "../src/lib/whatsapp/inbound-postprocess-queue.ts";

const literal = (value) => `'${value.replaceAll("'", "''")}'`;

async function main() {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || secret.length < 32) throw new Error("CRON_SECRET ausente.");
  const [permissions] = await prisma.$queryRaw`SELECT
    has_schema_privilege(current_user, 'cron', 'USAGE') AS cron,
    has_schema_privilege(current_user, 'net', 'USAGE') AS net`;
  if (!permissions?.cron || !permissions?.net) throw new Error("Permissões cron/pg_net ausentes.");

  const command = inboundPostProcessDispatchCommand(secret);
  await prisma.$executeRawUnsafe(
    `SELECT cron.schedule(${literal(INBOUND_POSTPROCESS_CRON_JOB)}, '5 seconds', ${literal(command)})`,
  );

  const jobs = await prisma.$queryRaw`SELECT jobname, schedule, active FROM cron.job WHERE jobname = ${INBOUND_POSTPROCESS_CRON_JOB}`;
  if (jobs.length !== 1 || jobs[0].schedule !== "5 seconds" || !jobs[0].active) {
    throw new Error("Agendador de pós-processamento não ficou ativo.");
  }
  console.log("Pós-processamento de entrada provisionado.");
}

main().catch(() => {
  console.error("Falha ao provisionar pós-processamento do WhatsApp. Nenhum grant foi alterado.");
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
