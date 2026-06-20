import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const SPEC_DEFAULT_STAGES = [
  { name: "Novo Lead", key: "novo_lead", color: "#3b82f6", position: 0 },
  { name: "Em Atendimento", key: "em_atendimento", color: "#eab308", position: 1 },
  { name: "Em Negociação", key: "em_negociacao", color: "#f97316", position: 2 },
  { name: "Fechado", key: "fechado", color: "#22c55e", position: 3 },
  { name: "Perdido", key: "perdido", color: "#ef4444", position: 4 },
];

async function main() {
  console.log('Starting pipeline migration...');

  // 1. Create or get Default Pipeline
  let defaultPipeline = await prisma.pipeline.findFirst({
    where: { name: "Funil de Vendas" }
  });

  if (!defaultPipeline) {
    defaultPipeline = await prisma.pipeline.create({
      data: {
        name: "Funil de Vendas",
        unit: "Barueri",
      }
    });
    console.log(`Created default pipeline with ID: ${defaultPipeline.id}`);
  } else {
    console.log(`Found existing pipeline: ${defaultPipeline.id}`);
  }

  // 2. Create or get Stages
  const stageMap = new Map<string, string>(); // key to stageId

  for (const s of SPEC_DEFAULT_STAGES) {
    let stage = await prisma.pipelineStage.findFirst({
      where: { pipelineId: defaultPipeline.id, name: s.name }
    });

    if (!stage) {
      stage = await prisma.pipelineStage.create({
        data: {
          pipelineId: defaultPipeline.id,
          name: s.name,
          color: s.color,
          position: s.position
        }
      });
      console.log(`Created stage ${s.name} with ID: ${stage.id}`);
    } else {
      console.log(`Found existing stage ${s.name}: ${stage.id}`);
    }
    
    stageMap.set(s.key, stage.id);
  }

  // 3. Migrate all SalesPipeline entries
  const deals = await prisma.salesPipeline.findMany({
    where: { pipelineId: null }
  });

  console.log(`Found ${deals.length} deals to migrate.`);

  let migratedCount = 0;
  for (const deal of deals) {
    const newStageId = stageMap.get(deal.stage) || stageMap.get("novo_lead");
    
    if (newStageId) {
      await prisma.salesPipeline.update({
        where: { id: deal.id },
        data: {
          pipelineId: defaultPipeline.id,
          stageId: newStageId
        }
      });
      migratedCount++;
    }
  }

  console.log(`Migration completed. ${migratedCount} deals successfully linked to the new Pipeline structure.`);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
