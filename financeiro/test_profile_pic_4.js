const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function test() {
  const instance = await prisma.whatsAppInstance.findFirst({ where: { name: "virtuosa-main" } });
  if (!instance) return;
  
  const UAZAPI_URL = "https://free.uazapi.com";
  // The documentation says /chat/fetchProfilePictureUrl/{instance}
  // With apikey instead of token! Let's try both.
  const res = await fetch(`${UAZAPI_URL}/chat/fetchProfilePictureUrl/${instance.name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': process.env.UAZAPI_ADMIN_TOKEN || "ZaW1qwTEkuq7Ub1cBUuyMiK5bNSu3nnMQ9lh7klElc2clSRV8t" },
    body: JSON.stringify({ number: "5511952750497" })
  });
  
  const data = await res.json();
  console.log("fetchProfilePictureUrl POST:", data);
}
test().finally(() => prisma.$disconnect());
