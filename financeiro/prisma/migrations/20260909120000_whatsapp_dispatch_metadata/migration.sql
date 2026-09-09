SET lock_timeout = '5s';
ALTER TABLE "WhatsAppMessage" ADD COLUMN IF NOT EXISTS "dispatchMetadata" JSONB;
