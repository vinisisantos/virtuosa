CREATE TABLE IF NOT EXISTS "WhatsAppInstanceNotificationPreference" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "instanceId" TEXT NOT NULL,
  "isMuted" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "WhatsAppInstanceNotificationPreference_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "WhatsAppInstanceNotificationPreference_userId_instanceId_key"
  ON "WhatsAppInstanceNotificationPreference"("userId", "instanceId");

CREATE INDEX IF NOT EXISTS "WhatsAppInstanceNotificationPreference_userId_isMuted_idx"
  ON "WhatsAppInstanceNotificationPreference"("userId", "isMuted");

CREATE INDEX IF NOT EXISTS "WhatsAppInstanceNotificationPreference_instanceId_idx"
  ON "WhatsAppInstanceNotificationPreference"("instanceId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'WhatsAppInstanceNotificationPreference_userId_fkey'
      AND conrelid = '"WhatsAppInstanceNotificationPreference"'::regclass
  ) THEN
    ALTER TABLE "WhatsAppInstanceNotificationPreference"
      ADD CONSTRAINT "WhatsAppInstanceNotificationPreference_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'WhatsAppInstanceNotificationPreference_instanceId_fkey'
      AND conrelid = '"WhatsAppInstanceNotificationPreference"'::regclass
  ) THEN
    ALTER TABLE "WhatsAppInstanceNotificationPreference"
      ADD CONSTRAINT "WhatsAppInstanceNotificationPreference_instanceId_fkey"
      FOREIGN KEY ("instanceId") REFERENCES "WhatsAppInstance"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
