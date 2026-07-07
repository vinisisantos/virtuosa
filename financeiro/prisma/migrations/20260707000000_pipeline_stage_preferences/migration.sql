-- CreateTable
CREATE TABLE IF NOT EXISTS "PipelineStagePreference" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "userId" TEXT NOT NULL,
    "pipelineId" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "customName" TEXT,
    "customColor" TEXT,
    "position" INTEGER,
    "isHidden" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PipelineStagePreference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "PipelineStagePreference_userId_stageId_key" ON "PipelineStagePreference"("userId", "stageId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PipelineStagePreference_userId_pipelineId_idx" ON "PipelineStagePreference"("userId", "pipelineId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PipelineStagePreference_pipelineId_idx" ON "PipelineStagePreference"("pipelineId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PipelineStagePreference_stageId_idx" ON "PipelineStagePreference"("stageId");

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "PipelineStagePreference"
        ADD CONSTRAINT "PipelineStagePreference_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "PipelineStagePreference"
        ADD CONSTRAINT "PipelineStagePreference_pipelineId_fkey"
        FOREIGN KEY ("pipelineId") REFERENCES "Pipeline"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "PipelineStagePreference"
        ADD CONSTRAINT "PipelineStagePreference_stageId_fkey"
        FOREIGN KEY ("stageId") REFERENCES "PipelineStage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Preserve Larissa's current Osasco view before restoring the shared/base
-- pipeline order. This keeps any order/name/color she adjusted while moving
-- future edits to per-user preferences.
INSERT INTO "PipelineStagePreference" (
    "userId",
    "pipelineId",
    "stageId",
    "customName",
    "customColor",
    "position",
    "isHidden"
)
SELECT
    u."id",
    p."id",
    s."id",
    s."name",
    s."color",
    s."position",
    false
FROM "User" u
JOIN "Pipeline" p ON p."unit" = u."unit" OR (u."unit" = 'Osasco' AND p."unit" = 'Barueri')
JOIN "PipelineStage" s ON s."pipelineId" = p."id"
WHERE lower(u."email") = 'larissa@virtuosa.com.br'
ON CONFLICT ("userId", "stageId") DO NOTHING;

-- Restore the canonical shared stage order used by automations. Existing
-- personalized preferences continue to control each user's visual order.
WITH canonical_stage_order("name", "position") AS (
    VALUES
        ('Novo Lead', 0),
        ('Em Atendimento', 1),
        ('Enviado', 2),
        ('Agendado', 3),
        ('Em Negociação', 4),
        ('Fechado', 5),
        ('Perdido', 6),
        ('Encerrado', 7)
)
UPDATE "PipelineStage" s
SET "position" = c."position"
FROM canonical_stage_order c
WHERE s."name" = c."name";
