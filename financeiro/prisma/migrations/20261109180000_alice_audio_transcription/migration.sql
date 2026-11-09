-- Aditiva e inativa por padrão. O corte de ativação só admite novos áudios.
CREATE TABLE IF NOT EXISTS "AliceAudioTranscript" (
  "messageId" TEXT PRIMARY KEY REFERENCES "WhatsAppMessage"(id) ON DELETE CASCADE,
  "conversationId" TEXT NOT NULL REFERENCES "WhatsAppConversation"(id) ON DELETE CASCADE,
  "instanceId" TEXT NOT NULL REFERENCES "WhatsAppInstance"(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing','ready','failed')),
  text TEXT,
  model TEXT NOT NULL DEFAULT 'gpt-transcribe',
  "durationMs" INTEGER,
  "costMicroUsd" INTEGER,
  error TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "AliceAudioTranscript_text_limit" CHECK (text IS NULL OR octet_length(text)<=16000)
);
CREATE INDEX IF NOT EXISTS "AliceAudioTranscript_conversationId_idx" ON "AliceAudioTranscript"("conversationId");
ALTER TABLE "AliceAudioTranscript" ENABLE ROW LEVEL SECURITY;
INSERT INTO "AppSetting" (id,key,value,"updatedAt") VALUES
  ('alice-audio-sbc-v1','alice_audio_sbc_v1','{"enabled":false,"activatedAt":null}',CURRENT_TIMESTAMP)
ON CONFLICT (key) DO NOTHING;
