export type RecordingDurationClock = {
  elapsedMs: number;
  activeSinceMs: number | null;
};

export function startRecordingDurationClock(nowMs: number): RecordingDurationClock {
  return { elapsedMs: 0, activeSinceMs: nowMs };
}

export function pauseRecordingDurationClock(
  clock: RecordingDurationClock,
  nowMs: number,
): RecordingDurationClock {
  if (clock.activeSinceMs === null) return clock;

  return {
    elapsedMs: clock.elapsedMs + Math.max(0, nowMs - clock.activeSinceMs),
    activeSinceMs: null,
  };
}

export function resumeRecordingDurationClock(
  clock: RecordingDurationClock,
  nowMs: number,
): RecordingDurationClock {
  if (clock.activeSinceMs !== null) return clock;
  return { ...clock, activeSinceMs: nowMs };
}

export function recordingDurationMs(clock: RecordingDurationClock, nowMs: number) {
  const activeMs = clock.activeSinceMs === null
    ? 0
    : Math.max(0, nowMs - clock.activeSinceMs);
  return Math.max(0, Math.round(clock.elapsedMs + activeMs));
}

export async function fixRecordedWebmDuration(blob: Blob, durationMs: number) {
  if (!blob.type.toLowerCase().includes("webm") || durationMs <= 0) return blob;

  const { default: fixWebmDuration } = await import("fix-webm-duration");
  return fixWebmDuration(blob, durationMs, { logger: false });
}
