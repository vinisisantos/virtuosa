const fs = require('fs');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function test() {
  const instance = await prisma.whatsAppInstance.findFirst();
  const contact = "5511952750497"; 
  const base64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
  
  const UAZAPI_URL = "https://free.uazapi.com";
  const res = await fetch(`${UAZAPI_URL}/send/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'token': instance.token },
    body: JSON.stringify({
      number: contact,
      type: 'image',
      file: `data:image/png;base64,${base64}`,
      text: 'test out'
    })
  });
  const data = await res.json();
  console.log("Send response:", data);
  
  if (data.id || data.messageid) {
     const dlRes = await fetch(`${UAZAPI_URL}/message/download`, {
       method: 'POST',
       headers: { 'Content-Type': 'application/json', 'token': instance.token },
       body: JSON.stringify({
         id: data.id || data.messageid,
         return_link: true,
         generate_mp3: true
       })
     });
     console.log("Download response:", await dlRes.json());
  }
}
test().finally(() => prisma.$disconnect());
