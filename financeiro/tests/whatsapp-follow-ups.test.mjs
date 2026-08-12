import assert from "node:assert/strict";
import test from "node:test";

import {
  isWhatsAppFollowUpDue,
  validateWhatsAppFollowUpSchedule,
  whatsAppFollowUpShortcutInput,
} from "../src/lib/whatsapp/follow-ups.ts";

test("valida o horário no fuso de São Paulo e exige uma observação", () => {
  const now = new Date("2026-08-12T15:00:00.000Z");
  const valid = validateWhatsAppFollowUpSchedule({
    date: "2026-08-13",
    time: "09:30",
    note: "Retornar sobre o valor do tratamento",
    now,
  });
  assert.equal(valid.scheduledAt?.toISOString(), "2026-08-13T12:30:00.000Z");
  assert.equal(validateWhatsAppFollowUpSchedule({ date: "2026-08-13", time: "09:30", note: "", now }).error, "Informe uma observação breve sobre o motivo do retorno");
});

test("rejeita retorno no passado", () => {
  const result = validateWhatsAppFollowUpSchedule({
    date: "2026-08-12",
    time: "11:00",
    note: "Conversar novamente",
    now: new Date("2026-08-12T15:00:00.000Z"),
  });
  assert.equal(result.error, "O retorno precisa ser agendado para um horário futuro");
});

test("rejeita datas e horários que o JavaScript normalizaria silenciosamente", () => {
  const now = new Date("2026-08-12T15:00:00.000Z");
  assert.equal(validateWhatsAppFollowUpSchedule({ date: "2026-02-31", time: "09:00", note: "Conversar", now }).error, "Informe uma data e um horário válidos");
  assert.equal(validateWhatsAppFollowUpSchedule({ date: "2026-08-13", time: "25:00", note: "Conversar", now }).error, "Informe uma data e um horário válidos");
});

test("calcula os atalhos sem depender do fuso do navegador", () => {
  const now = new Date("2026-08-12T15:00:00.000Z");
  assert.deepEqual(whatsAppFollowUpShortcutInput("tomorrow_morning", now), { date: "2026-08-13", time: "09:00" });
  assert.deepEqual(whatsAppFollowUpShortcutInput("next_monday", now), { date: "2026-08-17", time: "09:00" });
});

test("identifica retorno vencido sem misturar outros estados", () => {
  const now = new Date("2026-08-12T15:00:00.000Z");
  assert.equal(isWhatsAppFollowUpDue({ status: "scheduled", scheduledAt: "2026-08-12T14:59:00.000Z" }, now), true);
  assert.equal(isWhatsAppFollowUpDue({ status: "completed", scheduledAt: "2026-08-12T14:59:00.000Z" }, now), false);
});
