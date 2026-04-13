import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function run() {
  const t = await prisma.contractTemplate.findMany();
  console.log(`Found ${t.length} templates in DB.`);
  for(let x of t) {
    console.log(`- ${x.name}: fileBase64=${x.fileBase64 ? 'Yes (' + x.fileBase64.length + ' chars)' : 'No'}, bgPdf=${x.backgroundPdf ? 'Yes (' + x.backgroundPdf.length + ' chars)' : 'No'}`);
  }
}
run();
