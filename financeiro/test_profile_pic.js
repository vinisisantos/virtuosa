const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function test() {
  const instance = await prisma.whatsAppInstance.findFirst({ where: { name: "virtuosa-main" } });
  if (!instance) return;
  
  const UAZAPI_URL = "https://free.uazapi.com";
  const res = await fetch(`${UAZAPI_URL}/chat/profilePic?number=5511952750497`, {
    method: 'GET',
    headers: { 'token': instance.token }
  });
  
  const data = await res.json();
  console.log("Profile pic:", data);
}
test().finally(() => prisma.$disconnect());
