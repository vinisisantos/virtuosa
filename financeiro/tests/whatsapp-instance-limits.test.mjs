import assert from "node:assert/strict";
import test from "node:test";

import {
  countActiveWhatsAppInstancesForConnection,
  MAX_ACTIVE_WHATSAPP_INSTANCES_PER_OWNER_UNIT,
} from "../src/lib/whatsapp/instance-limits.ts";

test("permite até cinco instâncias ativas por responsável e unidade", () => {
  assert.equal(MAX_ACTIVE_WHATSAPP_INSTANCES_PER_OWNER_UNIT, 5);
  assert.equal(
    countActiveWhatsAppInstancesForConnection([
      { userId: "claudenice", unit: "Osasco", status: "connected" },
      { userId: "claudenice", unit: "Osasco", status: "connecting" },
      { userId: "recepcao", unit: "Osasco", status: "connected" },
      { userId: "claudenice", unit: "SCS", status: "connected" },
      { userId: "claudenice", unit: "Osasco", status: "disconnected" },
    ], "claudenice", "Osasco"),
    2,
  );
});

test("instância compartilhada ou legada do mesmo dono conta no escopo da unidade", () => {
  assert.equal(
    countActiveWhatsAppInstancesForConnection([
      { userId: "owner", unit: "Todas", status: "connected" },
      { userId: "owner", unit: null, status: "connecting" },
      { userId: "owner", unit: "SBC", status: "connected" },
    ], "owner", "Osasco"),
    2,
  );
});
