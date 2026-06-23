import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function backfill() {
  console.log("Starting backfill for User IDs...");

  // 1. Get all WhatsApp Instances and map them to User IDs
  const instances = await prisma.whatsAppInstance.findMany();
  const instanceToUserMap: Record<string, string> = {};
  for (const inst of instances) {
    if (inst.userId) {
      instanceToUserMap[inst.instanceId] = inst.userId;
    }
  }

  console.log("Instances with User:", Object.keys(instanceToUserMap).length);

  // 2. Find all conversations with a known instance
  const conversations = await prisma.whatsAppConversation.findMany({
    where: { instanceId: { in: Object.keys(instanceToUserMap) } },
    include: { contact: true }
  });

  let updatedClients = 0;
  let updatedPipelines = 0;

  for (const conv of conversations) {
    const userId = instanceToUserMap[conv.instanceId];
    if (!userId || !conv.contact?.phone) continue;

    // Update Client matching this phone and unit
    const clients = await prisma.client.findMany({
      where: { phone: conv.contact.phone }
    });

    for (const client of clients) {
      if (!client.userId) {
        await prisma.client.update({
          where: { id: client.id },
          data: { userId }
        });
        updatedClients++;
      }

      // Update their pipelines
      const pipelines = await prisma.salesPipeline.findMany({
        where: { clientId: client.id }
      });

      for (const pipeline of pipelines) {
        if (!pipeline.assignedTo) {
          await prisma.salesPipeline.update({
            where: { id: pipeline.id },
            data: { assignedTo: userId }
          });
          updatedPipelines++;
        }
      }
    }
  }

  console.log(`Finished! Updated ${updatedClients} Clients and ${updatedPipelines} Pipelines.`);
}

backfill()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
