const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function test() {
  const instance = await prisma.whatsAppInstance.findFirst({ where: { name: "virtuosa-main" } });
  if (!instance) return;
  
  const UAZAPI_URL = "https://free.uazapi.com";
  // Try POST to /chat/fetchProfilePicture
  const res = await fetch(`${UAZAPI_URL}/chat/fetchProfilePicture`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'token': instance.token },
    body: JSON.stringify({ number: "5511952750497" })
  });
  
  const data = await res.json();
  console.log("FetchProfilePicture POST:", data);
}
test().finally(() => prisma.$disconnect());
