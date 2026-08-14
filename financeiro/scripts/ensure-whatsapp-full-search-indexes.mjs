import { spawnSync } from "node:child_process";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) process.exit(1);

const indexes = [
  {
    name: "WhatsAppContact_name_search_trgm_idx",
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "WhatsAppContact_name_search_trgm_idx"
      ON "WhatsAppContact" USING GIN (
        public.virtuosa_search_normalize(COALESCE("name", '')) gin_trgm_ops
      );`,
  },
  {
    name: "WhatsAppContact_phone_digits_trgm_idx",
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "WhatsAppContact_phone_digits_trgm_idx"
      ON "WhatsAppContact" USING GIN (
        REGEXP_REPLACE(COALESCE("phone", ''), '[^0-9]', '', 'g') gin_trgm_ops
      );`,
  },
  {
    name: "WhatsAppConversation_assignee_search_trgm_idx",
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "WhatsAppConversation_assignee_search_trgm_idx"
      ON "WhatsAppConversation" USING GIN (
        public.virtuosa_search_normalize(COALESCE("assignedToName", '')) gin_trgm_ops
      );`,
  },
  {
    name: "WhatsAppMessage_body_search_trgm_idx",
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "WhatsAppMessage_body_search_trgm_idx"
      ON "WhatsAppMessage" USING GIN (
        public.virtuosa_search_normalize(COALESCE("body", '')) gin_trgm_ops
      );`,
  },
  {
    name: "WhatsAppConversationInternalNote_content_search_trgm_idx",
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "WhatsAppConversationInternalNote_content_search_trgm_idx"
      ON "WhatsAppConversationInternalNote" USING GIN (
        public.virtuosa_search_normalize(COALESCE("content", '')) gin_trgm_ops
      );`,
  },
  {
    name: "Client_campaignName_search_trgm_idx",
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "Client_campaignName_search_trgm_idx"
      ON "Client" USING GIN (
        public.virtuosa_search_normalize(COALESCE("campaignName", '')) gin_trgm_ops
      );`,
  },
  {
    name: "SalesPipeline_notes_search_trgm_idx",
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "SalesPipeline_notes_search_trgm_idx"
      ON "SalesPipeline" USING GIN (
        public.virtuosa_search_normalize(COALESCE("notes", '')) gin_trgm_ops
      );`,
  },
  {
    name: "Client_phone_suffix8_idx",
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "Client_phone_suffix8_idx"
      ON "Client" (
        RIGHT(REGEXP_REPLACE(COALESCE("phone", ''), '[^0-9]', '', 'g'), 8)
      );`,
  },
];

function executeSql(sql, failureMessage) {
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
  if (result.status !== 0) {
    console.error(failureMessage);
    process.exit(result.status || 1);
  }
}

for (const index of indexes) {
  // Uma tentativa interrompida de CREATE INDEX CONCURRENTLY pode deixar um
  // índice inválido com o mesmo nome. IF NOT EXISTS não o reconstrói, então
  // removemos somente esse resíduo antes de garantir o índice válido.
  executeSql(`DO $cleanup$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM pg_catalog.pg_class index_class
        JOIN pg_catalog.pg_namespace namespace
          ON namespace.oid = index_class.relnamespace
        JOIN pg_catalog.pg_index index_state
          ON index_state.indexrelid = index_class.oid
        WHERE namespace.nspname = 'public'
          AND index_class.relname = '${index.name}'
          AND NOT index_state.indisvalid
      ) THEN
        EXECUTE 'DROP INDEX IF EXISTS public."${index.name}"';
      END IF;
    END
  $cleanup$;`, `Falha ao limpar o índice inválido de busca ${index.name}.`);
  executeSql(index.sql, `Falha ao garantir o índice de busca ${index.name}.`);
}
