ALTER TABLE "WhatsAppInstance"
  ADD COLUMN IF NOT EXISTS "assignmentMode" TEXT NOT NULL DEFAULT 'OWNER',
  ADD COLUMN IF NOT EXISTS "defaultAssigneeId" TEXT;

CREATE INDEX IF NOT EXISTS "WhatsAppInstance_defaultAssigneeId_idx"
  ON "WhatsAppInstance"("defaultAssigneeId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'WhatsAppInstance_defaultAssigneeId_fkey'
      AND conrelid = '"WhatsAppInstance"'::regclass
  ) THEN
    ALTER TABLE "WhatsAppInstance"
      ADD CONSTRAINT "WhatsAppInstance_defaultAssigneeId_fkey"
      FOREIGN KEY ("defaultAssigneeId") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "WhatsAppInstanceMember" (
  "id" TEXT NOT NULL,
  "instanceId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'AGENT',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "WhatsAppInstanceMember_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "WhatsAppInstanceMember_instanceId_userId_key"
  ON "WhatsAppInstanceMember"("instanceId", "userId");

CREATE INDEX IF NOT EXISTS "WhatsAppInstanceMember_userId_isActive_idx"
  ON "WhatsAppInstanceMember"("userId", "isActive");

CREATE INDEX IF NOT EXISTS "WhatsAppInstanceMember_instanceId_isActive_idx"
  ON "WhatsAppInstanceMember"("instanceId", "isActive");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'WhatsAppInstanceMember_instanceId_fkey'
      AND conrelid = '"WhatsAppInstanceMember"'::regclass
  ) THEN
    ALTER TABLE "WhatsAppInstanceMember"
      ADD CONSTRAINT "WhatsAppInstanceMember_instanceId_fkey"
      FOREIGN KEY ("instanceId") REFERENCES "WhatsAppInstance"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'WhatsAppInstanceMember_userId_fkey'
      AND conrelid = '"WhatsAppInstanceMember"'::regclass
  ) THEN
    ALTER TABLE "WhatsAppInstanceMember"
      ADD CONSTRAINT "WhatsAppInstanceMember_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

INSERT INTO "WhatsAppInstanceMember" (
  "id", "instanceId", "userId", "role", "isActive", "createdBy", "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid()::text,
  instance."id",
  instance."userId",
  'OWNER',
  true,
  'migration:20260801153000',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "WhatsAppInstance" instance
WHERE instance."userId" IS NOT NULL
ON CONFLICT ("instanceId", "userId") DO UPDATE SET
  "role" = CASE
    WHEN "WhatsAppInstanceMember"."role" = 'OWNER' THEN 'OWNER'
    ELSE "WhatsAppInstanceMember"."role"
  END,
  "isActive" = true,
  "updatedAt" = CURRENT_TIMESTAMP;
