ALTER TABLE "AiShadowSetting"
  ALTER COLUMN "modelA" SET DEFAULT 'gemini:gemini-2.5-flash';

UPDATE "AiShadowSetting"
SET "modelA" = 'gemini:gemini-2.5-flash'
WHERE "unit" = 'Osasco'
  AND "modelA" = 'anthropic:claude-sonnet-5';
