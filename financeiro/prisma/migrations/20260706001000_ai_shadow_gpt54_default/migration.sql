ALTER TABLE "AiShadowSetting"
  ALTER COLUMN "modelB" SET DEFAULT 'openai:gpt-5.4';

UPDATE "AiShadowSetting"
SET "modelB" = 'openai:gpt-5.4'
WHERE "unit" = 'Osasco'
  AND "modelB" = 'groq:meta-llama/llama-4-scout-17b-16e-instruct';
