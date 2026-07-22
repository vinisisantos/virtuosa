export type ColorMode = "light" | "dark";

export function applyColorMode(mode: ColorMode) {
  if (typeof document === "undefined") return;

  const root = document.documentElement;
  root.setAttribute("data-mode", mode);
  // Compatibilidade temporária com seletores legados que ainda usam data-theme.
  root.setAttribute("data-theme", mode);
  root.classList.toggle("dark", mode === "dark");
}

export function savedColorMode(): ColorMode {
  if (typeof window === "undefined") return "dark";
  return localStorage.getItem("virtuosa_theme") === "light" ? "light" : "dark";
}
