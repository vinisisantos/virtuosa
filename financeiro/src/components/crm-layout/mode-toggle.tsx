"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { applyColorMode, savedColorMode } from "@/lib/color-mode";

export function ModeToggle({ className }: { className?: string }) {
  const [isDark, setIsDark] = useState(true);

  useEffect(() => {
    const nextIsDark = savedColorMode() === "dark";
    setIsDark(nextIsDark);
    applyColorMode(nextIsDark ? "dark" : "light");
  }, []);

  const toggleMode = () => {
    const next = !isDark;
    setIsDark(next);
    applyColorMode(next ? "dark" : "light");
    localStorage.setItem("virtuosa_theme", next ? "dark" : "light");
  };

  const goingTo = isDark ? "light" : "dark";

  return (
    <button
      type="button"
      onClick={toggleMode}
      aria-label={`Switch to ${goingTo} mode`}
      title={`Switch to ${goingTo} mode`}
      className={cn(
        "flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:h-10 sm:w-10",
        className,
      )}
    >
      {isDark ? (
        <Moon className="h-5 w-5" />
      ) : (
        <Sun className="h-5 w-5" />
      )}
    </button>
  );
}
