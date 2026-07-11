const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function test() {
  const adminToken = process.env.UAZAPI_ADMIN_TOKEN;
  if (!adminToken) throw new Error('UAZAPI_ADMIN_TOKEN is required');

  const instance = await prisma.whatsAppInstance.findFirst({ where: { name: "virtuosa-main" } });
  if (!instance) return;
  
  const UAZAPI_URL = "https://free.uazapi.com";
  // The documentation says /chat/fetchProfilePictureUrl/{instance}
  // With apikey instead of token! Let's try both.
  const res = await fetch(`${UAZAPI_URL}/chat/fetchProfilePictureUrl/${instance.name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': adminToken },
    body: JSON.stringify({ number: "5511952750497" })
  });
  
  const data = await res.json();
  console.log("fetchProfilePictureUrl POST:", data);
}
test().finally(() => prisma.$disconnect());
