UPDATE "WhatsAppConversation" conversation
SET
  "callbackDueAt" = conversation."lastOutboundAt" + interval '24 hours',
  "updatedAt" = NOW()
FROM "WhatsAppInstance" instance, "WhatsAppContact" contact
WHERE instance.id = conversation."instanceId"
  AND contact.id = conversation."contactId"
  AND conversation."callbackTrackingStartedAt" IS NOT NULL
  AND conversation."callbackDueAt" IS NOT NULL
  AND conversation."lastOutboundAt" IS NOT NULL
  AND conversation."callbackDueAt" = conversation."lastOutboundAt" + interval '12 hours'
  AND (
    conversation."lastInboundAt" IS NULL
    OR conversation."lastOutboundAt" > conversation."lastInboundAt"
  )
  AND conversation."callbackQueueStatus" <> 'suppressed_closed_package'
  AND conversation.status NOT IN ('closed', 'resolved', 'lost')
  AND (
    instance.unit = 'Osasco'
    OR (instance.unit = 'Todas' AND contact.unit = 'Osasco')
  );
