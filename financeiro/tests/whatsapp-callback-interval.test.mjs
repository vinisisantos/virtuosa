import assert from "node:assert/strict";
import test from "node:test";

import {
  WHATSAPP_CALLBACK_DEFAULT_INTERVAL_MS,
  WHATSAPP_CALLBACK_OSASCO_INTERVAL_MS,
  nextWhatsAppCallbackDueAtForUnit,
  whatsAppCallbackIntervalMsForUnit,
} from "../src/lib/whatsapp/callback-interval.ts";

test("estende o rechame de Osasco para 24 horas", () => {
  assert.equal(whatsAppCallbackIntervalMsForUnit("Osasco"), WHATSAPP_CALLBACK_OSASCO_INTERVAL_MS);
  assert.equal(whatsAppCallbackIntervalMsForUnit("  OSASCO  "), 24 * 60 * 60 * 1000);
});

test("preserva doze horas nas unidades fora do piloto", () => {
  assert.equal(whatsAppCallbackIntervalMsForUnit("SBC"), WHATSAPP_CALLBACK_DEFAULT_INTERVAL_MS);
  assert.equal(whatsAppCallbackIntervalMsForUnit("SCS"), WHATSAPP_CALLBACK_DEFAULT_INTERVAL_MS);
  assert.equal(whatsAppCallbackIntervalMsForUnit("Todas"), WHATSAPP_CALLBACK_DEFAULT_INTERVAL_MS);
});

test("calcula o próximo prazo a partir da última saída da equipe", () => {
  const sentAt = new Date("2026-08-24T12:00:00.000Z");
  assert.equal(
    nextWhatsAppCallbackDueAtForUnit(sentAt, "Osasco").toISOString(),
    "2026-08-25T12:00:00.000Z",
  );
  assert.equal(
    nextWhatsAppCallbackDueAtForUnit(sentAt, "SBC").toISOString(),
    "2026-08-25T00:00:00.000Z",
  );
});
