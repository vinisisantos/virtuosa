ALTER TABLE public."Client"
  ADD COLUMN IF NOT EXISTS "originUnit" TEXT;

CREATE INDEX IF NOT EXISTS "Client_originUnit_idx"
  ON public."Client"("originUnit");

WITH client_keys AS (
  SELECT
    c.id,
    CASE
      WHEN length(national_digits) >= 10 THEN right(national_digits, 11)
      ELSE national_digits
    END AS phone_key
  FROM (
    SELECT
      id,
      CASE
        WHEN left(phone_digits, 2) = '55' AND length(phone_digits) > 11 THEN substring(phone_digits from 3)
        ELSE phone_digits
      END AS national_digits
    FROM (
      SELECT
        id,
        regexp_replace(coalesce(phone, ''), '\D', '', 'g') AS phone_digits
      FROM public."Client"
      WHERE "originUnit" IS NULL
        AND phone IS NOT NULL
    ) raw_client
  ) c
  WHERE national_digits <> ''
),
contact_keys AS (
  SELECT
    contact.id,
    CASE
      WHEN length(national_digits) >= 10 THEN right(national_digits, 11)
      ELSE national_digits
    END AS phone_key
  FROM (
    SELECT
      id,
      CASE
        WHEN left(phone_digits, 2) = '55' AND length(phone_digits) > 11 THEN substring(phone_digits from 3)
        ELSE phone_digits
      END AS national_digits
    FROM (
      SELECT
        id,
        regexp_replace(coalesce(phone, ''), '\D', '', 'g') AS phone_digits
      FROM public."WhatsAppContact"
      WHERE phone IS NOT NULL
    ) raw_contact
  ) contact
  WHERE national_digits <> ''
),
oldest_conversation_unit AS (
  SELECT DISTINCT ON (client_keys.id)
    client_keys.id,
    instance.unit
  FROM client_keys
  JOIN contact_keys
    ON contact_keys.phone_key = client_keys.phone_key
  JOIN public."WhatsAppConversation" conversation
    ON conversation."contactId" = contact_keys.id
  JOIN public."WhatsAppInstance" instance
    ON instance.id = conversation."instanceId"
  WHERE instance.unit IS NOT NULL
    AND instance.unit <> ''
  ORDER BY client_keys.id, conversation."createdAt" ASC, conversation.id ASC
)
UPDATE public."Client" client
SET "originUnit" = oldest_conversation_unit.unit
FROM oldest_conversation_unit
WHERE client.id = oldest_conversation_unit.id
  AND client."originUnit" IS NULL;
