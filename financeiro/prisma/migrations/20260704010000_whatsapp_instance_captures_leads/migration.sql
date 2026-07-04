ALTER TABLE public."WhatsAppInstance"
  ADD COLUMN IF NOT EXISTS "capturesLeads" BOOLEAN NOT NULL DEFAULT true;
