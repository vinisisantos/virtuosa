const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function test() {
  const instance = await prisma.whatsAppInstance.findFirst({ where: { name: "virtuosa-main" } });
  if (!instance) return;
  
  const UAZAPI_URL = "https://free.uazapi.com";
  const res = await fetch(`${UAZAPI_URL}/chat/fetchProfilePictureUrl`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'token': instance.token },
    body: JSON.stringify({ number: "5511952750497" })
  });
  
  const data = await res.json();
  console.log("FetchProfilePictureUrl POST:", data);
}
test().finally(() => prisma.$disconnect());
