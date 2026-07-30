CREATE TABLE IF NOT EXISTS "WhatsAppSavedReply" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "normalizedTitle" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "WhatsAppSavedReply_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "WhatsAppSavedReply_userId_normalizedTitle_key"
  ON "WhatsAppSavedReply"("userId", "normalizedTitle");

CREATE INDEX IF NOT EXISTS "WhatsAppSavedReply_userId_updatedAt_idx"
  ON "WhatsAppSavedReply"("userId", "updatedAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'WhatsAppSavedReply_userId_fkey'
      AND conrelid = '"WhatsAppSavedReply"'::regclass
  ) THEN
    ALTER TABLE "WhatsAppSavedReply"
      ADD CONSTRAINT "WhatsAppSavedReply_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
