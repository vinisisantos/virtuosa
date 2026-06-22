const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function cleanDuplicates() {
  console.log('🔍 Buscando conversas duplicadas...');

  // Encontrar contato+instância com mais de 1 conversa
  const duplicates = await prisma.$queryRaw`
    SELECT "contactId", "instanceId", COUNT(*) as cnt
    FROM "WhatsAppConversation"
    GROUP BY "contactId", "instanceId"
    HAVING COUNT(*) > 1
  `;

  console.log(`Encontradas ${duplicates.length} dupla(s) de contato+instância com conversas duplicadas.`);

  for (const dup of duplicates) {
    const conversations = await prisma.whatsAppConversation.findMany({
      where: {
        contactId: dup.contactId,
        instanceId: dup.instanceId,
      },
      orderBy: { createdAt: 'asc' },
      include: { contact: true },
    });

    const keep = conversations[0]; // manter a mais antiga
    const toDelete = conversations.slice(1);

    console.log(`\n📌 Contato: ${keep.contact?.name || keep.contact?.phone} (${conversations.length} conversas)`);
    console.log(`   Mantendo: ${keep.id} (criada ${keep.createdAt})`);

    for (const conv of toDelete) {
      // Mover mensagens para a conversa principal
      const moved = await prisma.whatsAppMessage.updateMany({
        where: { conversationId: conv.id },
        data: { conversationId: keep.id },
      });
      console.log(`   Movendo ${moved.count} mensagens de ${conv.id} → ${keep.id}`);

      // Deletar a conversa duplicada
      await prisma.whatsAppConversation.delete({
        where: { id: conv.id },
      });
      console.log(`   ✅ Deletada conversa duplicada: ${conv.id}`);
    }

    // Atualizar lastMessage/lastMessageAt da conversa mantida
    const lastMsg = await prisma.whatsAppMessage.findFirst({
      where: { conversationId: keep.id },
      orderBy: { timestamp: 'desc' },
    });
    if (lastMsg) {
      await prisma.whatsAppConversation.update({
        where: { id: keep.id },
        data: {
          lastMessage: lastMsg.body,
          lastMessageAt: lastMsg.timestamp,
          unreadCount: await prisma.whatsAppMessage.count({
            where: { conversationId: keep.id, fromMe: false, status: { not: 'read' } },
          }),
        },
      });
    }
  }

  console.log('\n✅ Limpeza concluída!');
  await prisma.$disconnect();
}

cleanDuplicates().catch(console.error);
