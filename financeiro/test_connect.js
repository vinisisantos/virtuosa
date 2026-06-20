const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function test() {
  const dbInstance = await prisma.whatsAppInstance.findFirst({
    where: { name: "virtuosa-main" },
  });
  
  if (!dbInstance) {
      console.log("No instance found in DB");
      return;
  }
  
  const UAZAPI_URL = "https://free.uazapi.com";
  
  console.log("Connecting with token:", dbInstance.token);
  const connectRes = await fetch(`${UAZAPI_URL}/instance/connect`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "token": dbInstance.token,
    },
    body: JSON.stringify({ browser: "auto" }), 
  });
  
  const connectData = await connectRes.json();
  console.log("Connect response:", connectRes.status, connectData);
  
}
test().finally(() => prisma.$disconnect());
