ALTER TABLE "WhatsAppMessage"
  ADD COLUMN IF NOT EXISTS "linkPreviewUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "linkPreviewTitle" TEXT,
  ADD COLUMN IF NOT EXISTS "linkPreviewDescription" TEXT,
  ADD COLUMN IF NOT EXISTS "linkPreviewThumbnailUrl" TEXT;
