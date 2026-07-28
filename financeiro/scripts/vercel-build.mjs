import { spawnSync } from "node:child_process";

function run(command, args, env = process.env) {
  const result = spawnSync(command, args, { stdio: "inherit", shell: false, env });
  if (result.status !== 0) process.exit(result.status || 1);
}

function migrationDatabaseUrl(value) {
  const url = new URL(value);
  if (url.hostname.endsWith(".pooler.supabase.com") && url.port === "6543") {
    url.port = "5432";
  }
  url.searchParams.delete("pgbouncer");
  url.searchParams.set("connect_timeout", "15");
  return url.toString();
}

if (process.env.VERCEL_ENV === "production") {
  if (!process.env.DATABASE_URL) process.exit(1);
  const migrationUrl = migrationDatabaseUrl(process.env.DATABASE_URL);
  const requiredMigrations = [
    "prisma/migrations/20260725143000_ai_public_test_links/migration.sql",
    "prisma/migrations/20260727113000_ai_training_campaign_creatives/migration.sql",
    "prisma/migrations/20260728123000_seed_approved_campaign_knowledge/migration.sql",
    "prisma/migrations/20260728170000_ai_public_price_audit/migration.sql",
  ];
  for (const migration of requiredMigrations) {
    run("npx", ["prisma", "db", "execute", "--file", migration, "--url", migrationUrl], {
      ...process.env,
      // O host direto do Supabase é IPv6 e não é alcançável no build da Vercel.
      // O SQL idempotente usa o Supavisor em modo sessão (5432); o runtime mantém 6543.
    });
  }
}

run("npm", ["run", "build"]);
