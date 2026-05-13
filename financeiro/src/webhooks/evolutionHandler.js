'use strict';

const express = require('express');
const { routeInboundMessage } = require('../services/messageRouter');

const router = express.Router();

// Events that carry historical data — must never touch the DB
const HISTORY_EVENTS = new Set([
  'messaging-history.set',
  'messages.set',
  'chats.set',
  'contacts.set',
]);

const ALLOWED_EVENTS = new Set([
  'messages.upsert',
  'connection.update',
]);

/**
 * POST /webhooks/evolution
 *
 * Responds 200 immediately to prevent Evolution API retries,
 * then processes the payload asynchronously.
 */
router.post('/', (req, res) => {
  // Acknowledge before any async work so Evolution API never retries
  res.sendStatus(200);

  const payload = req.body;
  const event = payload?.event;
  const instanceName = payload?.instance;

  if (!event) return;

  // Hard block: history sync events are forbidden in Day Zero mode
  if (HISTORY_EVENTS.has(event)) {
    console.warn(`[evolution-webhook] BLOCKED history event: ${event} | instance: ${instanceName}`);
    return;
  }

  // Silently discard anything not in the allowlist
  if (!ALLOWED_EVENTS.has(event)) return;

  if (event === 'connection.update') {
    const state = payload?.data?.state;
    console.info(`[evolution-webhook] connection.update | instance: ${instanceName} | state: ${state}`);
    return;
  }

  if (event === 'messages.upsert') {
    const messages = payload?.data?.messages ?? [];

    for (const message of messages) {
      const key = message?.key ?? {};

      // Ignore own messages
      if (key.fromMe === true) continue;

      const remoteJid = key.remoteJid ?? '';

      // Ignore group messages
      if (remoteJid.endsWith('@g.us')) continue;

      routeInboundMessage(message, instanceName).catch((err) => {
        console.error(`[evolution-webhook] routeInboundMessage error: ${err.message}`, {
          messageId: key.id,
          remoteJid,
          instanceName,
        });
      });
    }
  }
});

module.exports = router;
