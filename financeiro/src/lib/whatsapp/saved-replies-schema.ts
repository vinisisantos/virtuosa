import { prisma } from "@/lib/db";

let schemaSetupPromise: Promise<void> | null = null;

const SAVED_REPLY_CATEGORY_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS "WhatsAppSavedReplyCategory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "normalizedTitle" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WhatsAppSavedReplyCategory_pkey" PRIMARY KEY ("id")
  )`,
  `ALTER TABLE "WhatsAppSavedReply" ADD COLUMN IF NOT EXISTS "categoryId" TEXT`,
  `ALTER TABLE "WhatsAppSavedReply" ADD COLUMN IF NOT EXISTS "position" INTEGER NOT NULL DEFAULT 0`,
  `WITH "usersWithoutOrder" AS (
    SELECT "userId"
    FROM "WhatsAppSavedReply"
    GROUP BY "userId"
    HAVING COUNT(*) > 1 AND MAX("position") = 0 AND MIN("position") = 0
  ), "rankedReplies" AS (
    SELECT reply."id", ROW_NUMBER() OVER (
      PARTITION BY reply."userId"
      ORDER BY reply."updatedAt" DESC, reply."id" DESC
    ) - 1 AS "nextPosition"
    FROM "WhatsAppSavedReply" reply
    INNER JOIN "usersWithoutOrder" pending ON pending."userId" = reply."userId"
  )
  UPDATE "WhatsAppSavedReply" reply
  SET "position" = ranked."nextPosition"
  FROM "rankedReplies" ranked
  WHERE reply."id" = ranked."id"`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "WhatsAppSavedReplyCategory_userId_normalizedTitle_key" ON "WhatsAppSavedReplyCategory"("userId", "normalizedTitle")`,
  `CREATE INDEX IF NOT EXISTS "WhatsAppSavedReplyCategory_userId_title_idx" ON "WhatsAppSavedReplyCategory"("userId", "title")`,
  `CREATE INDEX IF NOT EXISTS "WhatsAppSavedReply_categoryId_idx" ON "WhatsAppSavedReply"("categoryId")`,
  `CREATE INDEX IF NOT EXISTS "WhatsAppSavedReply_userId_position_idx" ON "WhatsAppSavedReply"("userId", "position")`,
  `DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'WhatsAppSavedReplyCategory_userId_fkey'
        AND conrelid = '"WhatsAppSavedReplyCategory"'::regclass
    ) THEN
      ALTER TABLE "WhatsAppSavedReplyCategory"
        ADD CONSTRAINT "WhatsAppSavedReplyCategory_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
  END $$`,
  `DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'WhatsAppSavedReply_categoryId_fkey'
        AND conrelid = '"WhatsAppSavedReply"'::regclass
    ) THEN
      ALTER TABLE "WhatsAppSavedReply"
        ADD CONSTRAINT "WhatsAppSavedReply_categoryId_fkey"
        FOREIGN KEY ("categoryId") REFERENCES "WhatsAppSavedReplyCategory"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
  END $$`,
] as const;

function isMissingSavedReplyCategorySchema(error: unknown) {
  if (!error || typeof error !== "object" || !("code" in error)) return false;
  return error.code === "P2021" || error.code === "P2022";
}

async function ensureSavedReplyCategorySchema() {
  if (!schemaSetupPromise) {
    schemaSetupPromise = prisma.$transaction(async (tx) => {
      await tx.$queryRawUnsafe(
        `SELECT pg_advisory_xact_lock(hashtext('whatsapp_saved_reply_categories_schema'))::text AS "lockAcquired"`,
      );
      for (const statement of SAVED_REPLY_CATEGORY_SCHEMA_STATEMENTS) {
        await tx.$executeRawUnsafe(statement);
      }
    }, { maxWait: 5_000, timeout: 20_000 }).catch((error) => {
      schemaSetupPromise = null;
      throw error;
    });
  }
  return schemaSetupPromise;
}

export async function withSavedReplyCategorySchema<T>(operation: () => Promise<T>) {
  try {
    return await operation();
  } catch (error) {
    if (!isMissingSavedReplyCategorySchema(error)) throw error;
    await ensureSavedReplyCategorySchema();
    return operation();
  }
}
