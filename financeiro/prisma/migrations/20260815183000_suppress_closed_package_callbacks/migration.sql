-- Clientes com venda/pacote fechado não devem permanecer nem voltar ao rechame.
-- A atualização é idempotente e preserva o histórico das tentativas já realizadas.
UPDATE "WhatsAppConversation" AS conversation
SET
  "callbackDueAt" = NULL,
  "callbackTrackingStartedAt" = NULL,
  "callbackStreakCount" = 0,
  "callbackPipelineSyncedAt" = NOW(),
  "callbackQueueStatus" = 'suppressed_closed_package',
  "updatedAt" = NOW()
FROM "WhatsAppContact" AS contact, "WhatsAppInstance" AS instance
WHERE conversation."contactId" = contact."id"
  AND conversation."instanceId" = instance."id"
  AND conversation."callbackQueueStatus" <> 'suppressed_closed_package'
  AND EXISTS (
    SELECT 1
    FROM "Client" AS client
    WHERE client."phone" IS NOT NULL
      AND REGEXP_REPLACE(client."phone", '[^0-9]', '', 'g') <> ''
      AND RIGHT(REGEXP_REPLACE(client."phone", '[^0-9]', '', 'g'), 11)
        = RIGHT(REGEXP_REPLACE(contact."phone", '[^0-9]', '', 'g'), 11)
      AND (
        EXISTS (
          SELECT 1
          FROM "SalesPipeline" AS deal
          WHERE deal."clientId" = client."id"
            AND deal."stage" = 'fechado'
            AND (
              instance."unit" = deal."unit"
              OR (instance."unit" = 'Todas' AND contact."unit" = deal."unit")
            )
        )
        OR EXISTS (
          SELECT 1
          FROM "Package" AS package
          WHERE package."clientId" = client."id"
            AND package."status" IN ('ativo', 'concluido')
            AND (
              instance."unit" = package."unit"
              OR (instance."unit" = 'Todas' AND contact."unit" = package."unit")
            )
        )
      )
  );

UPDATE "WhatsAppCallbackAttempt" AS attempt
SET
  "status" = 'suppressed_closed_package',
  "updatedAt" = NOW()
FROM "WhatsAppConversation" AS conversation
WHERE attempt."conversationId" = conversation."id"
  AND conversation."callbackQueueStatus" = 'suppressed_closed_package'
  AND attempt."status" IN ('waiting_response', 'responded');
