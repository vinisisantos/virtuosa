'use strict';

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const MEDIA_TYPES = new Set(['imageMessage', 'audioMessage', 'videoMessage', 'documentMessage']);

/**
 * Strips WhatsApp JID suffixes and device identifiers from a remoteJid.
 * Examples:
 *   "5511999999999@s.whatsapp.net"  → "5511999999999"
 *   "5511999999999:5@s.whatsapp.net" → "5511999999999"
 *   "5511999999999@g.us"             → "5511999999999"
 */
function extractPhone(remoteJid) {
  return remoteJid
    .replace(/@s\.whatsapp\.net$/, '')
    .replace(/@g\.us$/, '')
    .replace(/:\d+$/, '');
}

/**
 * Extracts the human-readable content from a WhatsApp message object.
 * Returns a text string or a "[mídia]" placeholder for media messages.
 */
function extractContent(message) {
  const msg = message?.message ?? {};

  if (msg.conversation) return { text: msg.conversation, contentType: 'text' };

  if (msg.extendedTextMessage?.text) {
    return { text: msg.extendedTextMessage.text, contentType: 'text' };
  }

  for (const mediaType of MEDIA_TYPES) {
    if (msg[mediaType]) {
      const label = mediaType.replace('Message', '');
      return { text: `[${label}]`, contentType: label };
    }
  }

  return { text: null, contentType: 'unknown' };
}

/**
 * Routes an inbound WhatsApp message to the appropriate CRM flow.
 *
 * @param {object} message   - Raw message object from Evolution API webhook
 * @param {string} instanceName - Evolution API instance name
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

  let contact = await prisma.cRMContact.findUnique({ where: { phone } });
  let session;

  if (!contact) {
    // ── New lead flow ──────────────────────────────────────────────
    contact = await prisma.cRMContact.create({
      data: {
        phone,
        name: pushName,
        source: 'whatsapp',
        instanceName,
        leadStatus: 'new',
        lastContactAt: messageTimestamp,
      },
    });

    session = await prisma.cRMSession.create({
      data: {
        contactId: contact.id,
        status: 'new',
        startedAt: messageTimestamp,
      },
    });

    await notifyNewLead(contact, session);
  } else {
    // ── Existing contact flow ──────────────────────────────────────
    session = await prisma.cRMSession.findFirst({
      where: { contactId: contact.id, status: 'active' },
      orderBy: { startedAt: 'desc' },
    });

    if (!session) {
      session = await prisma.cRMSession.create({
        data: {
          contactId: contact.id,
          status: 'active',
          startedAt: messageTimestamp,
        },
      });
    }

    await prisma.cRMContact.update({
      where: { id: contact.id },
      data: { lastContactAt: messageTimestamp },
    });
  }

  // ── Persist message (idempotent) ───────────────────────────────
  await prisma.cRMMessage.upsert({
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

/**
 * Placeholder notification hook — replace with your real alerting logic
 * (push notification, SSE broadcast, Slack webhook, etc.)
 */
async function notifyNewLead(contact, session) {
  console.info(`[messageRouter] new lead | phone: ${contact.phone} | session: ${session.id}`);
}

module.exports = { routeInboundMessage };
