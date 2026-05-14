'use strict';

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

/**
 * Purges all CRM data for the given Evolution API instance.
 * Runs inside a transaction to ensure atomicity.
 * Deletion order respects FK constraints: messages → sessions → contacts.
 */
async function clearInstanceData(instanceName) {
  console.info(`[ClearService] Iniciando purge da instância: ${instanceName}`);

  try {
    const result = await prisma.$transaction(async (tx) => {
      const { count: messages } = await tx.message.deleteMany({
        where: { contact: { instanceName } },
      });

      const { count: sessions } = await tx.session.deleteMany({
        where: { contact: { instanceName } },
      });

      const { count: contacts } = await tx.contact.deleteMany({
        where: { instanceName },
      });

      return { contacts, sessions, messages };
    });

    console.info(
      `[ClearService] Purge concluído. Contacts: ${result.contacts}, Sessions: ${result.sessions}, Messages: ${result.messages}`
    );

    return result;
  } catch (err) {
    console.error(`[ClearService] Erro ao purgar instância ${instanceName}:`, err);
    throw err;
  }
}

module.exports = { clearInstanceData };
