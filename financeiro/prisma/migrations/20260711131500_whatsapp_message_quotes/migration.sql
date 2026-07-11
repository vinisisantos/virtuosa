ALTER TABLE "WhatsAppMessage"
  ADD COLUMN IF NOT EXISTS "quotedMessageId" TEXT,
  ADD COLUMN IF NOT EXISTS "quotedMessageBody" TEXT,
  ADD COLUMN IF NOT EXISTS "quotedMessageType" TEXT,
  ADD COLUMN IF NOT EXISTS "quotedMessageFromMe" BOOLEAN;

