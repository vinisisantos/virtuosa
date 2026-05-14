'use strict';

const express = require('express');
const { routeInboundMessage } = require('../services/messageRouter');
const { clearInstanceData } = require('../services/clearService');

const router = express.Router();

// In-memory state per instance — survives process lifetime, reset only on disconnect
const instanceStateCache = new Map();

// History events that carry pre-connection data — must never reach the DB
const HISTORY_EVENTS = new Set([
  'messaging-history.set',
  'messages.set',
  'chats.set',
  'contacts.set',
]);

const ALLOWED_EVENTS = new Set([
  'messages.upsert',
  'connection.update',
  'qrcode.updated',
]);

/**
 * POST /webhooks/evolution
 *
 * Responds 200 immediately to prevent Evolution API retries,
 * then processes the payload asynchronously.
 */
router.post('/', (req, res) => {
  res.sendStatus(200);

  const { event: rawEvent, instance, data } = req.body ?? {};
  if (!rawEvent) return;

  const event = rawEvent.toLowerCase();

  if (HISTORY_EVENTS.has(event)) {
    console.warn(`[evolution-webhook] BLOCKED history event: ${event} | instance: ${instance}`);
    return;
  }

  if (!ALLOWED_EVENTS.has(event)) return;

  switch (event) {
    case 'connection.update':
      handleConnectionUpdate(data, instance).catch((err) =>
        console.error(`[evolution-webhook] handleConnectionUpdate error:`, err)
      );
      break;

    case 'messages.upsert':
      if (instanceStateCache.get(instance) !== 'OPEN') {
        console.info(
          `[evolution-webhook] message discarded — instance ${instance} not OPEN (state: ${instanceStateCache.get(instance) ?? 'unknown'})`
        );
        return;
      }
      handleNewMessage(data, instance);
      break;

    case 'qrcode.updated':
      console.info(`[evolution-webhook] qrcode.updated | instance: ${instance}`);
      break;
  }
});

async function handleConnectionUpdate(data, instance) {
  const state = (data?.state ?? '').toUpperCase();

  if (state === 'OPEN') {
    instanceStateCache.set(instance, 'OPEN');
    console.info(`[evolution-webhook] instance ${instance} OPEN — ready to receive messages`);
    return;
  }

  if (state === 'CLOSE' || state === 'DISCONNECTED') {
    instanceStateCache.set(instance, 'DISCONNECTED');
    console.info(`[evolution-webhook] instance ${instance} DISCONNECTED — purging data`);
    await clearInstanceData(instance);
    return;
  }

  if (state === 'CONNECTING') {
    instanceStateCache.set(instance, 'CONNECTING');
    console.info(`[evolution-webhook] instance ${instance} CONNECTING`);
  }
}

function handleNewMessage(data, instance) {
  const messages = Array.isArray(data) ? data : [data];

  for (const message of messages) {
    const key = message?.key ?? {};

    if (key.fromMe === true) continue;

    const remoteJid = key.remoteJid ?? '';
    if (remoteJid.endsWith('@g.us')) continue;

    routeInboundMessage(message, instance).catch((err) => {
      console.error(`[evolution-webhook] routeInboundMessage error: ${err.message}`, {
        messageId: key.id,
        remoteJid,
        instance,
      });
    });
  }
}

module.exports = router;
