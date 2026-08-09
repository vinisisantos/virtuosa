import assert from "node:assert/strict";
import test from "node:test";

import {
  EVALUATION_STATUS_ACTION_VALUES,
  EVALUATION_STATUS_VALUES,
  isAttendedEvaluationStatus,
  isConfirmedEvaluationStatus,
  isFinalEvaluationStatus,
  isPendingEvaluationStatus,
  normalizeEvaluationStatus,
} from "../src/lib/evaluation-status.ts";

test("confirmação é um status próprio e selecionável", () => {
  assert.equal(normalizeEvaluationStatus("confirmado"), "confirmado");
  assert.equal(isConfirmedEvaluationStatus("Confirmado"), true);
  assert.equal(isPendingEvaluationStatus("confirmado"), false);
  assert.equal(isAttendedEvaluationStatus("confirmado"), false);
  assert.equal(isFinalEvaluationStatus("confirmado"), false);
  assert.equal(EVALUATION_STATUS_ACTION_VALUES.includes("confirmado"), true);
});

test("compareceu permanece apenas como legado de presença", () => {
  assert.equal(EVALUATION_STATUS_VALUES.includes("compareceu"), true);
  assert.equal(EVALUATION_STATUS_ACTION_VALUES.includes("compareceu"), false);
  assert.equal(normalizeEvaluationStatus("compareceu"), "compareceu");
  assert.equal(isAttendedEvaluationStatus("compareceu"), true);
});
