import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
async function run() {
  const count = await prisma.reembolsoTicket.count({ where: { unit: 'Barueri' } })
  console.log('Barueri ReembolsoTickets count:', count)
}
run()
