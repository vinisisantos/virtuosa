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
    "prisma/migrations/20260728223000_ai_public_campaign_binding/migration.sql",
    "prisma/migrations/20260728234500_ai_public_sdr_state/migration.sql",
    "prisma/migrations/20260729123000_seed_ai_unit_addresses/migration.sql",
    "prisma/migrations/20260730143000_whatsapp_conversation_archiving/migration.sql",
    "prisma/migrations/20260730200000_crm_lead_count_adjustments/migration.sql",
    "prisma/migrations/20260730213000_whatsapp_saved_replies/migration.sql",
    "prisma/migrations/20260801153000_whatsapp_instance_members/migration.sql",
    "prisma/migrations/20260806133000_ai_public_v6_links/migration.sql",
    "prisma/migrations/20260811120000_whatsapp_contact_blocking/migration.sql",
    "prisma/migrations/20260811154500_whatsapp_instance_notification_preferences/migration.sql",
    "prisma/migrations/20260812120000_whatsapp_scheduled_follow_ups/migration.sql",
    "prisma/migrations/20260814013000_whatsapp_internal_notes/migration.sql",
    "prisma/migrations/20260814023000_whatsapp_full_search/migration.sql",
    "prisma/migrations/20260815130000_whatsapp_callback_attempts/migration.sql",
  ];
  for (const migration of requiredMigrations) {
    run("npx", ["prisma", "db", "execute", "--file", migration, "--url", migrationUrl], {
      ...process.env,
      // O host direto do Supabase é IPv6 e não é alcançável no build da Vercel.
      // O SQL idempotente usa o Supavisor em modo sessão (5432); o runtime mantém 6543.
    });
  }
  run(process.execPath, ["scripts/ensure-whatsapp-full-search-indexes.mjs"], {
    ...process.env,
    DATABASE_URL: migrationUrl,
  });
}

run("npm", ["run", "build"]);
