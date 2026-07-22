export type ColorMode = "light" | "dark";
export type BrowserChromeSurface = "app" | "inbox";

const BROWSER_CHROME_COLORS: Record<ColorMode, Record<BrowserChromeSurface, string>> = {
  light: { app: "#f8f9fb", inbox: "#f0f2f5" },
  dark: { app: "#090b10", inbox: "#202c33" },
};

function syncBrowserChromeColor(mode: ColorMode) {
  const root = document.documentElement;
  const surface = root.dataset.browserChromeSurface === "inbox" ? "inbox" : "app";
  const color = BROWSER_CHROME_COLORS[mode][surface];
  let themeMeta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]:not([media])');

  if (!themeMeta) {
    themeMeta = document.createElement("meta");
    themeMeta.name = "theme-color";
    document.head.appendChild(themeMeta);
  }

  themeMeta.content = color;
  root.style.setProperty("--browser-chrome-color", color);
  root.style.colorScheme = mode;
}

export function applyColorMode(mode: ColorMode) {
  if (typeof document === "undefined") return;

  const root = document.documentElement;
  root.setAttribute("data-mode", mode);
  // Compatibilidade temporária com seletores legados que ainda usam data-theme.
  root.setAttribute("data-theme", mode);
  root.classList.toggle("dark", mode === "dark");
  syncBrowserChromeColor(mode);
}

export function setBrowserChromeSurface(surface: BrowserChromeSurface) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.browserChromeSurface = surface;
  syncBrowserChromeColor(document.documentElement.dataset.mode === "light" ? "light" : "dark");
}

export function savedColorMode(): ColorMode {
  if (typeof window === "undefined") return "dark";
  return localStorage.getItem("virtuosa_theme") === "light" ? "light" : "dark";
}
