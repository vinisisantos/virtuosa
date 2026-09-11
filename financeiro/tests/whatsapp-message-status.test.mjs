import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  extractEvolutionStatusUpdate,
  mergeWhatsAppMessageStatus,
  normalizeWhatsAppMessageStatus,
  normalizeWahaMessageAck,
  whatsAppStatusUpdateFilter,
} from "../src/lib/whatsapp/message-status.ts";

test("normaliza ACKs numéricos, strings e enums sem inferir status desconhecido", () => {
  for (const [number, status] of ["error", "pending", "sent", "delivered", "read", "played"].entries()) {
    assert.equal(normalizeWhatsAppMessageStatus(number), status);
    assert.equal(normalizeWhatsAppMessageStatus(String(number)), status);
    assert.equal(normalizeWhatsAppMessageStatus(` ${status.toUpperCase()} `), status);
  }
  assert.equal(normalizeWhatsAppMessageStatus("SERVER_ACK"), "sent");
  assert.equal(normalizeWhatsAppMessageStatus("DELIVERY_ACK"), "delivered");
  for (const value of [null, undefined, {}, true, "", "unknown", "READ_BY_ME", 99]) {
    assert.equal(normalizeWhatsAppMessageStatus(value), null);
  }
});

test("WAHA tem escala própria e ACK desconhecido não simula envio", () => {
  for (const [ack, expected] of [[-1, "error"], [0, "pending"], [1, "sent"], [2, "delivered"], [3, "read"], [4, "played"]]) {
    assert.equal(normalizeWahaMessageAck(null, ack), expected);
    assert.equal(normalizeWahaMessageAck(null, String(ack)), expected);
  }
  assert.equal(normalizeWahaMessageAck("DEVICE", 3), "delivered");
  assert.equal(normalizeWahaMessageAck("READ", 2), "read");
  assert.equal(normalizeWahaMessageAck("future-status", undefined), null);
});

test("replays e ACKs fora de ordem nunca regridem entrega ou leitura", () => {
  assert.equal(mergeWhatsAppMessageStatus("READ", "SERVER_ACK"), "read");
  assert.equal(mergeWhatsAppMessageStatus("delivered", "PENDING"), "delivered");
  assert.equal(mergeWhatsAppMessageStatus("read", "PLAYED"), "played");
  assert.equal(mergeWhatsAppMessageStatus("played", "READ"), "played");
  assert.equal(mergeWhatsAppMessageStatus("sent", "ERROR"), "error");
  assert.equal(mergeWhatsAppMessageStatus("error", "PENDING"), "error");
  assert.equal(mergeWhatsAppMessageStatus("error", "SERVER_ACK"), "error");
  assert.equal(mergeWhatsAppMessageStatus("error", "DELIVERY_ACK"), "delivered");
  assert.equal(mergeWhatsAppMessageStatus("read", "ERROR"), "read");
  assert.equal(mergeWhatsAppMessageStatus("deleted", "READ"), "deleted");
  assert.equal(mergeWhatsAppMessageStatus("sent", "future-status"), "sent");
});

test("filtro atômico protege estados superiores, inclusive enums históricos", () => {
  for (const next of ["pending", "sent", "delivered", "read", "played", "error"]) {
    const filter = whatsAppStatusUpdateFilter(next);
    assert.equal(filter.mode, "insensitive");
    for (const current of ["PENDING", "SENT", "SERVER_ACK", "DELIVERED", "DELIVERY_ACK", "READ", "PLAYED", "ERROR", "DELETED"]) {
      assert.equal(filter.notIn.includes(current), mergeWhatsAppMessageStatus(current, next) !== next);
    }
  }
});

test("extrai formato plano Evolution e nested Baileys, sem usar ID interno do provedor", () => {
  const expected = { messageId: "wa-id", remoteJid: "5511900000000@s.whatsapp.net", status: "read" };
  assert.deepEqual(extractEvolutionStatusUpdate({ keyId: "wa-id", messageId: "provider-db-id", remoteJid: expected.remoteJid, fromMe: true, status: "READ" }), expected);
  assert.deepEqual(extractEvolutionStatusUpdate({ key: { id: "wa-id", remoteJid: expected.remoteJid, fromMe: true }, update: { status: 4 } }), expected);
  assert.equal(extractEvolutionStatusUpdate({ messageId: "provider-db-id", remoteJid: expected.remoteJid, status: "READ" }), null);
  assert.equal(extractEvolutionStatusUpdate({ key: { id: "wa-id", remoteJid: expected.remoteJid, fromMe: false }, update: { status: 4 } }), null);
});

test("abrir chat zera somente contador local, não promove mensagens para lidas", async () => {
  const source = await readFile(new URL("../src/app/api/whatsapp/messages/route.ts", import.meta.url), "utf8");
  const get = source.slice(source.indexOf("export async function GET"), source.indexOf("export async function POST"));
  assert.match(get, /data: \{ unreadCount: 0 \}/);
  assert.doesNotMatch(get, /whatsAppMessage\.(update|updateMany|upsert)/);
});
