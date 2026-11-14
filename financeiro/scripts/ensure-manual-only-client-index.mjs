import { spawnSync } from "node:child_process";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) process.exit(1);

function executeSql(sql) {
  const result = spawnSync(
    "npx",
    ["prisma", "db", "execute", "--stdin", "--url", databaseUrl],
    {
      cwd: process.cwd(),
      env: process.env,
      input: sql,
      stdio: ["pipe", "inherit", "inherit"],
      encoding: "utf8",
      shell: false,
    },
  );
  if (result.status !== 0) process.exit(result.status || 1);
}

const indexName = "Client_manualOnlyPhoneKey_idx";

executeSql(`DO $cleanup$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class index_class
    JOIN pg_catalog.pg_namespace namespace ON namespace.oid = index_class.relnamespace
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid = index_class.oid
    WHERE namespace.nspname = 'public'
      AND index_class.relname = '${indexName}'
      AND NOT index_state.indisvalid
  ) THEN
    EXECUTE 'DROP INDEX IF EXISTS public."${indexName}"';
  END IF;
END
$cleanup$;`);

executeSql(`CREATE INDEX CONCURRENTLY IF NOT EXISTS "${indexName}"
  ON "Client"("manualOnlyPhoneKey");`);
