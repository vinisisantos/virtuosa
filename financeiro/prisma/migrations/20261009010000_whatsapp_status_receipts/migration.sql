CREATE TABLE IF NOT EXISTS "WhatsAppStatusReceipt" (
    "id" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "remoteJid" TEXT NOT NULL,
    "receiptStatus" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimToken" TEXT,
    "claimedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WhatsAppStatusReceipt_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "WhatsAppStatusReceipt_state_check"
      CHECK ("state" IN ('pending', 'processing', 'completed', 'failed', 'ambiguous')),
    CONSTRAINT "WhatsAppStatusReceipt_status_check"
      CHECK ("receiptStatus" IN ('error', 'pending', 'sent', 'delivered', 'read', 'played', 'deleted')),
    CONSTRAINT "WhatsAppStatusReceipt_attempts_check" CHECK ("attempts" >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS "WhatsAppStatusReceipt_identity_key"
  ON "WhatsAppStatusReceipt"("instanceId", "messageId", "remoteJid", "receiptStatus");
CREATE INDEX IF NOT EXISTS "WhatsAppStatusReceipt_state_availableAt_idx"
  ON "WhatsAppStatusReceipt"("state", "availableAt");
CREATE INDEX IF NOT EXISTS "WhatsAppStatusReceipt_state_claimedAt_idx"
  ON "WhatsAppStatusReceipt"("state", "claimedAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'WhatsAppStatusReceipt_instanceId_fkey'
      AND conrelid = '"WhatsAppStatusReceipt"'::regclass
  ) THEN
    ALTER TABLE "WhatsAppStatusReceipt"
      ADD CONSTRAINT "WhatsAppStatusReceipt_instanceId_fkey"
      FOREIGN KEY ("instanceId") REFERENCES "WhatsAppInstance"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- A fila pertence exclusivamente ao backend; não conceder acesso pelo Data API.
ALTER TABLE "WhatsAppStatusReceipt" ENABLE ROW LEVEL SECURITY;
