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
  run("npx", ["prisma", "migrate", "deploy"], {
    ...process.env,
    // O host direto do Supabase é IPv6 e não é alcançável no build da Vercel.
    // A migration usa o Supavisor em modo sessão (5432); o runtime mantém 6543.
    DATABASE_URL: migrationUrl,
    DIRECT_URL: migrationUrl,
    PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK: "1",
  });
}

run("npm", ["run", "build"]);
