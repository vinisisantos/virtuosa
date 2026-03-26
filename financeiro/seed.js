const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  const hashedPassword = await bcrypt.hash('123', 10);
  const user = await prisma.user.upsert({
    where: { email: 'admin@virtuosa.com' },
    update: {},
    create: {
      email: 'admin@virtuosa.com',
      name: 'Admin Master',
      password: hashedPassword,
      role: 'ADMINISTRADOR',
      unit: 'Barueri',
      isActive: true,
    },
  });
  console.log('Seed created:', user);
}
main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
