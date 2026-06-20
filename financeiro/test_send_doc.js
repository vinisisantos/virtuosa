const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function test() {
  const instance = await prisma.whatsAppInstance.findFirst();
  const contact = "5511952750497"; 
  const base64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
  
  const UAZAPI_URL = "https://free.uazapi.com";
  try {
      const res = await fetch(`${UAZAPI_URL}/send/media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'token': instance.token },
        body: JSON.stringify({
          number: contact,
          type: 'document',
          docName: 'TestDoc.pdf',
          file: `data:application/pdf;base64,${base64}`,
          text: 'test doc'
        })
      });
      const data = await res.json();
      console.log("Send document response:", data);
  } catch(e) {
      console.error(e);
  }
}
test().finally(() => prisma.$disconnect());
