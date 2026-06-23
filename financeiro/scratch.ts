import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const instances = await prisma.whatsAppInstance.findMany({
    include: { user: true }
  });
  console.log(JSON.stringify(instances, null, 2));
}

main()
  .catch((e) => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
