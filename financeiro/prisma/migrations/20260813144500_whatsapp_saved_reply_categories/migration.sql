CREATE TABLE IF NOT EXISTS "WhatsAppSavedReplyCategory" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "normalizedTitle" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "WhatsAppSavedReplyCategory_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "WhatsAppSavedReply"
  ADD COLUMN IF NOT EXISTS "categoryId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "WhatsAppSavedReplyCategory_userId_normalizedTitle_key"
  ON "WhatsAppSavedReplyCategory"("userId", "normalizedTitle");

CREATE INDEX IF NOT EXISTS "WhatsAppSavedReplyCategory_userId_title_idx"
  ON "WhatsAppSavedReplyCategory"("userId", "title");

CREATE INDEX IF NOT EXISTS "WhatsAppSavedReply_categoryId_idx"
  ON "WhatsAppSavedReply"("categoryId");

DO $$
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
END $$;

DO $$
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
END $$;
