-- Alice registra sugestões nas duas unidades permitidas; linhas existentes permanecem em SBC.
ALTER TABLE IF EXISTS "AiAssistantDraft"
  DROP CONSTRAINT IF EXISTS "AiAssistantDraft_unit_check";
ALTER TABLE IF EXISTS "AiAssistantDraft"
  ADD CONSTRAINT "AiAssistantDraft_unit_check" CHECK ("unit" IN ('SBC', 'Osasco'));

ALTER TABLE IF EXISTS "AiAssistantOperation"
  DROP CONSTRAINT IF EXISTS "AiAssistantOperation_unit_check";
ALTER TABLE IF EXISTS "AiAssistantOperation"
  ADD CONSTRAINT "AiAssistantOperation_unit_check" CHECK ("unit" IN ('SBC', 'Osasco'));
