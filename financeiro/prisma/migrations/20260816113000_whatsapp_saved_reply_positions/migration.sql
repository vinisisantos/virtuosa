ALTER TABLE "WhatsAppSavedReply"
  ADD COLUMN IF NOT EXISTS "position" INTEGER NOT NULL DEFAULT 0;

WITH "usersWithoutOrder" AS (
  SELECT "userId"
  FROM "WhatsAppSavedReply"
  GROUP BY "userId"
  HAVING COUNT(*) > 1 AND MAX("position") = 0 AND MIN("position") = 0
), "rankedReplies" AS (
  SELECT reply."id", ROW_NUMBER() OVER (
    PARTITION BY reply."userId"
    ORDER BY reply."updatedAt" DESC, reply."id" DESC
  ) - 1 AS "nextPosition"
  FROM "WhatsAppSavedReply" reply
  INNER JOIN "usersWithoutOrder" pending ON pending."userId" = reply."userId"
)
UPDATE "WhatsAppSavedReply" reply
SET "position" = ranked."nextPosition"
FROM "rankedReplies" ranked
WHERE reply."id" = ranked."id";

CREATE INDEX IF NOT EXISTS "WhatsAppSavedReply_userId_position_idx"
  ON "WhatsAppSavedReply"("userId", "position");
