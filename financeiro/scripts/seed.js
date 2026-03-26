const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('🧹 Limpando todos os usuários antigos...');
  const deleted = await prisma.user.deleteMany({});
  console.log(`✅ ${deleted.count} usuários deletados.`);

  console.log('👑 Criando Super Administrador Master...');
  const hashedPassword = await bcrypt.hash('Vvini4518*', 10);

  const superAdmin = await prisma.user.create({
    data: {
      name: 'Vinicius Santos',
      email: 'viniciusn11@hotmail.com',
      password: hashedPassword,
      phone: '(11) 90000-0000',
      role: 'ADMINISTRADOR',
      unit: 'Barueri',
      isActive: true,
      permissions: {
        dashboard: true,
        cancelamento: true,
        pedidos: true,
        financeiro: true,
        perfil: true,
        usuarios: true,
        relatorios: true,
        admin: true
      }
    }
  });

  console.log('🌟 Super Administrador criado com sucesso:');
  console.log(superAdmin);
}

main()
  .catch((e) => {
    console.error('❌ Erro durante o Seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
