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

    if (runImmediately) void run();

    const interval = window.setInterval(() => {
      void run();
    }, intervalMs);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") void run(true);
    };

    const handleFocus = () => {
      void run(true);
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    if (runOnFocus) window.addEventListener("focus", handleFocus);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (runOnFocus) window.removeEventListener("focus", handleFocus);
    };
  }, [enabled, intervalMs, resumeThrottleMs, runImmediately, runOnFocus]);
}
