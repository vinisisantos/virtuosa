import assert from "node:assert/strict";
import test from "node:test";

import { evaluationScheduleMinuteRange } from "../src/lib/evaluation-schedule-conflict.ts";

test("conflito considera somente o mesmo minuto", () => {
  const minute = evaluationScheduleMinuteRange("2026-08-10T13:30:45.900Z");

  assert.equal(minute.start.toISOString(), "2026-08-10T13:30:00.000Z");
  assert.equal(minute.end.toISOString(), "2026-08-10T13:31:00.000Z");
});

test("um minuto posterior fica fora da janela de conflito", () => {
  const minute = evaluationScheduleMinuteRange("2026-08-10T13:00:00.000Z");
  const oneMinuteLater = new Date("2026-08-10T13:01:00.000Z");

  assert.equal(oneMinuteLater >= minute.start && oneMinuteLater < minute.end, false);
});

test("horário inválido continua sendo rejeitado", () => {
  assert.throws(
    () => evaluationScheduleMinuteRange("horário inválido"),
    /Data da avaliação inválida/,
  );
});
