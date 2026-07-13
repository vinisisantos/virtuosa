import { spawnSync } from "node:child_process";

if (process.env.VERCEL !== "1") {
  console.log("Migração de treinamento da IA ignorada fora da Vercel.");
  process.exit(0);
}

const databaseUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("DATABASE_URL ou DIRECT_URL não está configurada na produção.");
  process.exit(1);
}

const result = spawnSync(
  "npx",
  [
    "prisma",
    "db",
    "execute",
    "--file",
    "prisma/migrations/20260713190000_ai_training_chat_memory/migration.sql",
    "--schema",
    "prisma/schema.prisma",
  ],
  {
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      DIRECT_URL: databaseUrl,
    },
    stdio: "inherit",
  },
);

if (result.error) {
  console.error("Falha ao iniciar a migração de treinamento da IA.");
  process.exit(1);
}

process.exit(result.status ?? 1);
