const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  await prisma.whatsAppInstance.deleteMany({
    where: { name: "virtuosa-main" }
  });
  console.log("Instance deleted.");
}
run().finally(() => prisma.$disconnect());
