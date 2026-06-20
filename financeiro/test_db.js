const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const msgs = await prisma.whatsAppMessage.findMany({
    orderBy: { timestamp: 'desc' },
    take: 10
  });
  console.log(msgs.map(m => ({ id: m.id, fromMe: m.fromMe, type: m.type, body: m.body, mediaUrl: m.mediaUrl, time: m.timestamp })));
}
check().finally(() => prisma.$disconnect());
