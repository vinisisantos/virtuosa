import { prisma } from "#lib/db";

// Administrative activation, deliberately not run by the normal Vercel build.
// Never use --apply until the additive migration and API tests have passed.
const JOB = "ai-inbox-scs-observer-every-15-minutes";
const KEY = "ai_inbox_scs_v1";
const list = (value: string | undefined) => [
  ...new Set(
    (value || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  ),
];

async function main() {
  const apply = process.argv.includes("--apply");
  const pause = process.argv.includes("--pause");
  if (pause) {
    if (!apply) {
      console.log(
        "Simulação: desativar somente o piloto e seu job; preserva dados e lembretes.",
      );
      return;
    }
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`UPDATE "AppSetting" SET value = jsonb_set(value::jsonb, '{enabled}', 'false')::text WHERE key = ${KEY}`;
      await tx.$executeRaw`SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = ${JOB}`;
    });
    console.log("Piloto pausado; dados preservados.");
    return;
  }
  const instanceIds = list(process.env.AI_INBOX_INSTANCE_IDS);
  const reviewerIds = list(process.env.AI_INBOX_REVIEWER_IDS);
  const clinicalReviewerIds = list(process.env.AI_INBOX_CLINICAL_REVIEWER_IDS);
  if (!instanceIds.length || !reviewerIds.length)
    throw new Error("Informe instâncias SCS e revisores explicitamente");
  const instances = await prisma.whatsAppInstance.count({
    where: {
      id: { in: instanceIds },
      unit: "SCS",
      status: { not: "archived" },
    },
  });
  if (instances !== instanceIds.length)
    throw new Error("Há instância inválida ou de outra unidade");
  const allReviewers = [...new Set([...reviewerIds, ...clinicalReviewerIds])];
  if (
    (await prisma.user.count({
      where: { id: { in: allReviewers }, isActive: true },
    })) !== allReviewers.length
  )
    throw new Error("Há revisor inexistente/inativo");
  if (clinicalReviewerIds.some((id) => !reviewerIds.includes(id)))
    throw new Error(
      "Revisores técnicos também precisam constar em AI_INBOX_REVIEWER_IDS",
    );
  if (!apply) {
    console.log(
      `Simulação: ${instances} instâncias SCS, ${reviewerIds.length} revisores, ${clinicalReviewerIds.length} técnicos. Sem gravações.`,
    );
    return;
  }
  const secret = process.env.CRON_SECRET || "";
  if (secret.length < 32)
    throw new Error(
      "CRON_SECRET precisa estar configurado no ambiente administrativo autorizado",
    );
  const url = "https://clinicasgestao.com.br/api/cron/ai-inbox-observe";
  const command = `SELECT net.http_post(url := '${url}', headers := '${JSON.stringify({ "Content-Type": "application/json", Authorization: `Bearer ${secret}` }).replace(/'/g, "''")}'::jsonb, body := '{}'::jsonb);`;
  await prisma.$transaction(
    async (tx) => {
      const previous = await tx.appSetting.findUnique({ where: { key: KEY } });
      const activatedAt = previous
        ? JSON.parse(previous.value).activatedAt
        : new Date().toISOString();
      const value = JSON.stringify({
        enabled: true,
        activatedAt,
        instanceIds,
        reviewerIds,
        clinicalReviewerIds,
      });
      // Smoke test schema without writing a fake lead or knowledge record.
      await tx.$queryRaw`SELECT id FROM "AiInboxKnowledge" LIMIT 0`;
      await tx.appSetting.upsert({
        where: { key: KEY },
        create: { key: KEY, value },
        update: { value },
      });
      await tx.$executeRaw`SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = ${JOB}`;
      await tx.$executeRaw`SELECT cron.schedule(${JOB}, '*/15 * * * *', ${command})`;
    },
    { timeout: 15000 },
  );
  console.log(
    "Configuração e job preparados. Habilite os dois flags do ambiente somente após validar a aplicação.",
  );
}

main()
  .catch(() => {
    console.error(
      "Ativação não concluída. Confira permissões, parâmetros e estrutura com o administrador; nenhum segredo será exibido.",
    );
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
