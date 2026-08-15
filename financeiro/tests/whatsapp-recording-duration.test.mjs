import assert from "node:assert/strict";
import test from "node:test";

import {
  pauseRecordingDurationClock,
  recordingDurationMs,
  resumeRecordingDurationClock,
  startRecordingDurationClock,
} from "../src/lib/whatsapp/recording-duration.ts";

test("contabiliza todo o tempo de uma gravação contínua", () => {
  const clock = startRecordingDurationClock(1_000);
  assert.equal(recordingDurationMs(clock, 62_250), 61_250);
});

test("não inclui o intervalo em que a gravação ficou pausada", () => {
  let clock = startRecordingDurationClock(1_000);
  clock = pauseRecordingDurationClock(clock, 21_000);
  clock = resumeRecordingDurationClock(clock, 51_000);
  clock = pauseRecordingDurationClock(clock, 92_000);

  assert.equal(recordingDurationMs(clock, 120_000), 61_000);
});
