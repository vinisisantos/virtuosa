import assert from "node:assert/strict";
import test from "node:test";

import {
  buildEvaluationAvailabilityMessage,
  buildEvaluationAvailabilitySlots,
  evaluationAvailabilityRange,
} from "../src/lib/evaluation-availability.ts";

const BEFORE_RANGE = new Date("2026-08-18T06:00:00-03:00");

test("disponibilidade respeita o limite de sete dias", () => {
  assert.equal(evaluationAvailabilityRange("2026-08-18", "2026-08-24").dateKeys.length, 7);
  assert.throws(
    () => evaluationAvailabilityRange("2026-08-18", "2026-08-25"),
    /no máximo 7 dias/,
  );
});
test("domingo não é oferecido e sábado permanece disponível", () => {
  const slots = buildEvaluationAvailabilitySlots({
    startDate: "2026-08-22",
    endDate: "2026-08-23",
    now: BEFORE_RANGE,
  });
  assert.equal(slots.length, 28);
  assert.ok(slots.every((slot) => slot.date === "2026-08-22"));
});

test("somente o minuto já ocupado é retirado da lista", () => {
  const slots = buildEvaluationAvailabilitySlots({
    startDate: "2026-08-18",
    endDate: "2026-08-18",
    occupiedStartTimes: ["2026-08-18T10:00:00-03:00"],
    now: BEFORE_RANGE,
  });
  assert.equal(slots.some((slot) => slot.time === "10:00"), false);
  assert.equal(slots.some((slot) => slot.time === "10:30"), true);
  assert.equal(slots.length, 27);
});

test("filtro de período mantém apenas os horários da manhã", () => {
  const slots = buildEvaluationAvailabilitySlots({
    startDate: "2026-08-18",
    endDate: "2026-08-18",
    period: "morning",
    now: BEFORE_RANGE,
  });
  assert.deepEqual(slots.map((slot) => slot.time), [
    "07:00", "07:30", "08:00", "08:30", "09:00",
    "09:30", "10:00", "10:30", "11:00", "11:30",
  ]);
});

test("mensagem agrupa os horários do mesmo dia em uma única linha", () => {
  const slots = buildEvaluationAvailabilitySlots({
    startDate: "2026-08-18",
    endDate: "2026-08-18",
    now: BEFORE_RANGE,
  }).slice(0, 2);
  assert.equal(
    buildEvaluationAvailabilityMessage(slots),
    [
      "Tenho estes horários disponíveis para sua avaliação: 🌸",
      "",
      "Terça-feira, 18/08, às 7h - 7h30",
      "",
      "Qual dessas opções fica melhor para você?",
    ].join("\n"),
  );
});

test("mensagem mantém dias diferentes em linhas separadas", () => {
  const slots = buildEvaluationAvailabilitySlots({
    startDate: "2026-08-21",
    endDate: "2026-08-22",
    period: "morning",
    now: BEFORE_RANGE,
  });
  const selected = slots.filter((slot) => ["09:00", "09:30"].includes(slot.time));

  assert.equal(
    buildEvaluationAvailabilityMessage(selected),
    [
      "Tenho estes horários disponíveis para sua avaliação: 🌸",
      "",
      "Sexta-feira, 21/08, às 9h - 9h30",
      "Sábado, 22/08, às 9h - 9h30",
      "",
      "Qual dessas opções fica melhor para você?",
    ].join("\n"),
  );
});
