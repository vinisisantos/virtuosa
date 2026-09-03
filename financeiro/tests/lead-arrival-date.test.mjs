import assert from "node:assert/strict";
import test from "node:test";

import { leadArrivalMatchesEventDay } from "../src/lib/whatsapp/lead-arrival-date.ts";

test("aceita o lead cuja chegada ocorreu no mesmo dia de São Paulo", () => {
  assert.equal(
    leadArrivalMatchesEventDay(
      { arrivedAt: new Date("2026-09-03T13:00:00.000Z"), createdAt: new Date("2026-09-03T13:00:01.000Z") },
      new Date("2026-09-03T14:00:00.000Z"),
    ),
    true,
  );
});

test("rejeita conversa nova de um lead que chegou em dia anterior", () => {
  assert.equal(
    leadArrivalMatchesEventDay(
      { arrivedAt: new Date("2026-09-02T15:00:00.000Z"), createdAt: new Date("2026-09-02T15:00:00.000Z") },
      new Date("2026-09-03T15:00:00.000Z"),
    ),
    false,
  );
});

test("usa createdAt para registros legados sem arrivedAt", () => {
  assert.equal(
    leadArrivalMatchesEventDay(
      { arrivedAt: null, createdAt: new Date("2026-09-04T01:30:00.000Z") },
      new Date("2026-09-03T18:00:00.000Z"),
    ),
    true,
  );
});

test("compara pelo calendário de São Paulo, não pelo dia UTC", () => {
  assert.equal(
    leadArrivalMatchesEventDay(
      { arrivedAt: new Date("2026-09-04T01:30:00.000Z"), createdAt: new Date("2026-09-04T01:30:00.000Z") },
      new Date("2026-09-03T03:15:00.000Z"),
    ),
    true,
  );
});
