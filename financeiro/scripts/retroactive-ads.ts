import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function run() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const clients = await prisma.client.findMany({
    where: {
      createdAt: { gte: today },
      source: 'whatsapp'
    }
  });

  let count = 0;

  for (const client of clients) {
    // Find the first message from this client
    const conversation = await prisma.whatsAppConversation.findFirst({
      where: { contact: { phone: client.phone } },
      include: {
        messages: {
          where: { fromMe: false },
          orderBy: { timestamp: 'asc' },
          take: 1
        }
      }
    });

    if (conversation && conversation.messages.length > 0) {
      const firstMsg = conversation.messages[0].body.toLowerCase();
      // Common Facebook Ad templates
      if (
        firstMsg.includes('tenho interesse e queria mais informações') ||
        firstMsg.includes('oi! como podemos ajudar') ||
        firstMsg.includes('vi no facebook') ||
        firstMsg.includes('vi no instagram') ||
        firstMsg.includes('anúncio') ||
        firstMsg.includes('gostaria de saber mais sobre o anúncio')
      ) {
        await prisma.client.update({
          where: { id: client.id },
          data: {
            source: 'facebook_ad',
            campaignName: 'Campanha Desconhecida (Retroativa)'
          }
        });
        count++;
      }
    }
  }

  console.log(`Retroactively updated ${count} clients from today.`);
}

run()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
