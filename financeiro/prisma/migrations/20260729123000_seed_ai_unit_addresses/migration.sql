INSERT INTO "AiUnitKnowledge" (
  "id",
  "unit",
  "address",
  "updatedBy",
  "createdAt",
  "updatedAt"
)
VALUES
  (
    gen_random_uuid()::text,
    'Osasco',
    'Rua Eloy Cândido Lopes, 61 - Centro, Osasco - SP, 06010-130',
    'system:approved-unit-addresses-2026-07-29',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    gen_random_uuid()::text,
    'SBC',
    'Avenida das Nações Unidas, 30 - Jardim do Mar, São Bernardo do Campo - SP, 09726-110',
    'system:approved-unit-addresses-2026-07-29',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    gen_random_uuid()::text,
    'SCS',
    'Avenida Vital Brasil Filho, 143 - Osvaldo Cruz, São Caetano do Sul - SP, 09541-130',
    'system:approved-unit-addresses-2026-07-29',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  )
ON CONFLICT ("unit") DO UPDATE
SET
  "address" = EXCLUDED."address",
  "updatedBy" = EXCLUDED."updatedBy",
  "updatedAt" = CURRENT_TIMESTAMP;
