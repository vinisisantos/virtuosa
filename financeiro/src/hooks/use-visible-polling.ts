"use client";

import { useEffect, useRef } from "react";

interface VisiblePollingOptions {
  enabled?: boolean;
  runImmediately?: boolean;
  runOnFocus?: boolean;
  resumeThrottleMs?: number;
}

export function useVisiblePolling(
  callback: () => void | Promise<void>,
  intervalMs: number,
  {
    enabled = true,
    runImmediately = true,
    runOnFocus = true,
    resumeThrottleMs = 2_000,
  }: VisiblePollingOptions = {}
) {
  const callbackRef = useRef(callback);
  const inFlightRef = useRef(false);
  const lastRunAtRef = useRef(0);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!enabled || intervalMs <= 0) return;

    let cancelled = false;
    let interval: number | null = null;

    const run = async (throttleResume = false) => {
      if (cancelled || inFlightRef.current) return;
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;

      const now = Date.now();
      if (throttleResume && now - lastRunAtRef.current < resumeThrottleMs) return;

      inFlightRef.current = true;
      lastRunAtRef.current = now;
      try {
        await callbackRef.current();
      } catch {
      } finally {
        inFlightRef.current = false;
      }
    };

    const stopPolling = () => {
      if (!interval) return;
      window.clearInterval(interval);
      interval = null;
    };

    const startPolling = (runNow: boolean, throttleResume = true) => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      if (!interval) {
        interval = window.setInterval(() => {
          void run();
        }, intervalMs);
      }
      if (runNow) void run(throttleResume);
    };

    startPolling(runImmediately, false);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        stopPolling();
        return;
      }
      startPolling(true);
    };

    const handleFocus = () => {
      void run(true);
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    if (runOnFocus) window.addEventListener("focus", handleFocus);

    return () => {
      cancelled = true;
      stopPolling();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (runOnFocus) window.removeEventListener("focus", handleFocus);
    };
  }, [enabled, intervalMs, resumeThrottleMs, runImmediately, runOnFocus]);
}
