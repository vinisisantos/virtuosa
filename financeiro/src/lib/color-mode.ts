export type ColorMode = "light" | "dark";
export type BrowserChromeSurface = "app" | "inbox";

const BROWSER_CHROME_COLORS: Record<ColorMode, Record<BrowserChromeSurface, string>> = {
  light: { app: "#f8f9fb", inbox: "#f0f2f5" },
  dark: { app: "#090b10", inbox: "#202c33" },
};

const APPLE_STATUS_BAR_STYLES: Record<ColorMode, string> = {
  light: "default",
  dark: "black-translucent",
};

function setMetaContent(name: string, content: string) {
  const metas = Array.from(document.querySelectorAll<HTMLMetaElement>(`meta[name="${name}"]`));

  if (metas.length === 0) {
    const meta = document.createElement("meta");
    meta.name = name;
    meta.content = content;
    document.head.appendChild(meta);
    return;
  }

  for (const meta of metas) {
    meta.content = content;
  }
}

function syncBrowserChromeColor(mode: ColorMode) {
  const root = document.documentElement;
  const surface = root.dataset.browserChromeSurface === "inbox" ? "inbox" : "app";
  const color = BROWSER_CHROME_COLORS[mode][surface];

  setMetaContent("theme-color", color);
  setMetaContent("apple-mobile-web-app-status-bar-style", APPLE_STATUS_BAR_STYLES[mode]);
  root.style.setProperty("--browser-chrome-color", color);
  root.style.backgroundColor = color;
  root.style.colorScheme = mode;

  if (document.body) {
    document.body.style.backgroundColor = color;
  }
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

export function colorModeInitScript() {
  return `
    (function () {
      try {
        var root = document.documentElement;
        var mode = localStorage.getItem("virtuosa_theme") === "light" ? "light" : "dark";
        var surface = root.dataset.browserChromeSurface === "inbox" ? "inbox" : "app";
        var colors = ${JSON.stringify(BROWSER_CHROME_COLORS)};
        var statusBarStyles = ${JSON.stringify(APPLE_STATUS_BAR_STYLES)};
        var color = colors[mode][surface];

        root.setAttribute("data-mode", mode);
        root.setAttribute("data-theme", mode);
        root.classList.toggle("dark", mode === "dark");
        root.style.setProperty("--browser-chrome-color", color);
        root.style.backgroundColor = color;
        root.style.colorScheme = mode;

        function setMeta(name, content) {
          var metas = document.querySelectorAll('meta[name="' + name + '"]');
          if (metas.length === 0) {
            var meta = document.createElement("meta");
            meta.setAttribute("name", name);
            meta.setAttribute("content", content);
            document.head.appendChild(meta);
            return;
          }
          metas.forEach(function (meta) {
            meta.setAttribute("content", content);
          });
        }

        setMeta("theme-color", color);
        setMeta("apple-mobile-web-app-status-bar-style", statusBarStyles[mode]);
      } catch (_) {}
    })();
  `;
}
