const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fixMedia() {
  const UAZAPI_URL = process.env.UAZAPI_URL || "https://free.uazapi.com";
  const instance = await prisma.whatsAppInstance.findFirst();
  
  const messages = await prisma.whatsAppMessage.findMany({
    where: { type: 'media', mediaUrl: null }
  });

  for (const msg of messages) {
    console.log("Fixing msg", msg.messageId);
    try {
      const res = await fetch(`${UAZAPI_URL}/message/download`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "token": instance.token,
        },
        body: JSON.stringify({
          id: msg.messageId,
          return_link: true,
          generate_mp3: true
        })
      });
      const data = await res.json();
      console.log("Download res:", data);
      
      if (data && data.fileURL) {
        let finalType = 'document';
        if (data.mimetype) {
          if (data.mimetype.startsWith('image/')) finalType = 'image';
          else if (data.mimetype.startsWith('audio/')) finalType = 'audio';
          else if (data.mimetype.startsWith('video/')) finalType = 'video';
        }
        
        await prisma.whatsAppMessage.update({
          where: { id: msg.id },
          data: {
            type: finalType,
            mediaUrl: data.fileURL
          }
        });
        console.log("Updated", msg.messageId, "to", finalType);
      }
    } catch (e) {
      console.error("Error", e);
    }
  }
}
fixMedia().finally(() => prisma.$disconnect());
