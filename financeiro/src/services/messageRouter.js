'use strict';

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

/**
 * Strips WhatsApp JID suffixes and device identifiers.
 * "5511999999999@s.whatsapp.net"   → "5511999999999"
 * "5511999999999:5@s.whatsapp.net" → "5511999999999"
 */
function extractPhone(remoteJid) {
  return remoteJid
    .replace(/@s\.whatsapp\.net$/, '')
    .replace(/@g\.us$/, '')
    .replace(/:\d+$/, '');
}

function extractContent(message) {
  const msg = message?.message ?? {};

  if (msg.conversation) {
    return { text: msg.conversation, contentType: 'text', caption: null };
  }

  if (msg.extendedTextMessage?.text) {
    return { text: msg.extendedTextMessage.text, contentType: 'text', caption: null };
  }

  const mediaTypes = ['imageMessage', 'audioMessage', 'videoMessage', 'documentMessage'];
  for (const key of mediaTypes) {
    if (msg[key]) {
      const contentType = key.replace('Message', '');
      const caption = contentType === 'image' ? (msg[key].caption ?? null) : null;
      return { text: caption, contentType, caption };
    }
  }

  return { text: null, contentType: 'text', caption: null };
}

/**
 * Routes an inbound WhatsApp message to the appropriate CRM flow.
 * Creates Contact + Session + Message for new numbers.
 * Adds a Message to the active Session for existing contacts.
 */
async function routeInboundMessage(message, instanceName) {
  const key = message?.key ?? {};
  const remoteJid = key.remoteJid ?? '';
  const phone = extractPhone(remoteJid);
  const pushName = message?.pushName ?? null;
  const { text, contentType } = extractContent(message);

  const messageTimestamp = message?.messageTimestamp
    ? new Date(Number(message.messageTimestamp) * 1000)
    : new Date();

  let contact = await prisma.contact.findUnique({
    where: { phone_instanceName: { phone, instanceName } },
  });

  let session;

  if (!contact) {
    contact = await prisma.contact.create({
      data: {
        phone,
        name: pushName ?? phone,
        source: 'whatsapp',
        instanceName,
        leadStatus: 'new',
        lastContactAt: messageTimestamp,
      },
    });

    session = await prisma.session.create({
      data: {
        contactId: contact.id,
        status: 'new',
        startedAt: messageTimestamp,
      },
    });

    await notifyNewLead(contact, session);
  } else {
    session = await prisma.session.findFirst({
      where: { contactId: contact.id, status: { in: ['new', 'active'] } },
      orderBy: { startedAt: 'desc' },
    });

    if (!session) {
      session = await prisma.session.create({
        data: {
          contactId: contact.id,
          status: 'active',
          startedAt: messageTimestamp,
        },
      });
    }

    await prisma.contact.update({
      where: { id: contact.id },
      data: { lastContactAt: messageTimestamp },
    });
  }

  await prisma.message.upsert({
    where: { messageId: key.id },
    update: {},
    create: {
      sessionId: session.id,
      contactId: contact.id,
      messageId: key.id,
      direction: 'inbound',
      contentType,
      text,
      rawPayload: message,
      timestamp: messageTimestamp,
    },
  });
}

async function notifyNewLead(contact, session) {
  console.info(`[messageRouter] new lead | phone: ${contact.phone} | session: ${session.id}`);
}

module.exports = { routeInboundMessage };
