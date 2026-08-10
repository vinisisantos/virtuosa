import type { Prisma } from "@prisma/client";

type PipelineLookupDatabase = Pick<Prisma.TransactionClient, "pipeline">;

const pipelineSelection = {
  id: true,
  unit: true,
  stages: {
    select: { id: true, name: true, position: true },
    orderBy: { position: "asc" as const },
  },
};

export async function resolveDefaultPipelineForUnit(
  database: PipelineLookupDatabase,
  unit: string,
) {
  const unitPipeline = await database.pipeline.findFirst({
    where: { unit },
    select: pipelineSelection,
    orderBy: { createdAt: "asc" },
  });
  if (unitPipeline) return unitPipeline;

  return database.pipeline.findFirst({
    select: pipelineSelection,
    orderBy: { createdAt: "asc" },
  });
}
