import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const MAX_HTML_BYTES = 700_000;
const MAX_REDIRECTS = 3;
const PREVIEW_TIMEOUT_MS = 4_500;

export interface WhatsAppLinkPreview {
  url: string;
  title: string | null;
  description: string | null;
  thumbnailUrl: string | null;
}

function decodeHtmlEntities(value: string) {
  const namedEntities: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"',
  };

  return value.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (entity, token: string) => {
    if (token.startsWith("#x") || token.startsWith("#X")) {
      return String.fromCodePoint(Number.parseInt(token.slice(2), 16));
    }
    if (token.startsWith("#")) {
      return String.fromCodePoint(Number.parseInt(token.slice(1), 10));
    }
    return namedEntities[token.toLowerCase()] || entity;
  });
}

function cleanMetadata(value: string | null | undefined, maxLength: number) {
  if (!value) return null;
  const clean = decodeHtmlEntities(value).replace(/\s+/g, " ").trim();
  return clean ? clean.slice(0, maxLength) : null;
}

function tagAttributes(tag: string) {
  const attributes: Record<string, string> = {};
  const pattern = /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(tag))) {
    attributes[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? "";
  }
  return attributes;
}

function metadataMap(html: string) {
  const metadata = new Map<string, string>();
  for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
    const attributes = tagAttributes(tag);
    const key = (attributes.property || attributes.name || "").toLowerCase();
    if (key && attributes.content && !metadata.has(key)) {
      metadata.set(key, attributes.content);
    }
  }
  return metadata;
}

function firstMetadata(metadata: Map<string, string>, keys: string[]) {
  for (const key of keys) {
    const value = metadata.get(key);
    if (value) return value;
  }
  return null;
}

function absoluteHttpUrl(value: string | null, baseUrl: string) {
  if (!value) return null;
  try {
    const url = new URL(decodeHtmlEntities(value), baseUrl);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString().slice(0, 2_048) : null;
  } catch {
    return null;
  }
}

export function firstWhatsAppLink(text: string) {
  const match = text.match(/https?:\/\/[^\s<>]+/i);
  if (!match) return null;

  const candidate = match[0].replace(/[),.\]}>!?;:'"]+$/g, "");
  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString().slice(0, 2_048);
  } catch {
    return null;
  }
}

export function parseLinkPreviewHtml(html: string, pageUrl: string): WhatsAppLinkPreview | null {
  const metadata = metadataMap(html);
  const htmlTitle = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || null;
  const title = cleanMetadata(
    firstMetadata(metadata, ["og:title", "twitter:title"]) || htmlTitle,
    200,
  );
  const description = cleanMetadata(
    firstMetadata(metadata, ["og:description", "twitter:description", "description"]),
    500,
  );
  const thumbnailUrl = absoluteHttpUrl(
    firstMetadata(metadata, ["og:image:secure_url", "og:image", "twitter:image"]),
    pageUrl,
  );

  if (!title && !description && !thumbnailUrl) return null;
  return { url: pageUrl, title, description, thumbnailUrl };
}

function isPrivateIpv4(address: string) {
  const octets = address.split(".").map(Number);
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b] = octets;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51) ||
    (a === 203 && b === 0) ||
    a >= 224
  );
}

function isPrivateAddress(address: string) {
  const normalized = address.toLowerCase().split("%")[0];
  if (isIP(normalized) === 4) return isPrivateIpv4(normalized);
  if (isIP(normalized) !== 6) return true;

  if (normalized === "::" || normalized === "::1") return true;
  if (normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe8") || normalized.startsWith("fe9") || normalized.startsWith("fea") || normalized.startsWith("feb")) return true;
  if (normalized.startsWith("ff") || normalized.startsWith("2001:db8:")) return true;
  const mappedIpv4 = normalized.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  return mappedIpv4 ? isPrivateIpv4(mappedIpv4) : false;
}

async function assertPublicUrl(value: string) {
  const url = new URL(value);
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    (url.port && !["80", "443"].includes(url.port)) ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    hostname.endsWith(".lan")
  ) {
    throw new Error("URL de prévia não permitida");
  }

  const addresses = isIP(hostname)
    ? [{ address: hostname }]
    : await lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new Error("Destino de prévia não permitido");
  }
  return url;
}

async function readLimitedHtml(response: Response) {
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_HTML_BYTES) {
    throw new Error("Página excede o limite da prévia");
  }
  if (!response.body) return "";

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytesRead = 0;
  let html = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytesRead += value.byteLength;
    if (bytesRead > MAX_HTML_BYTES) {
      await reader.cancel();
      throw new Error("Página excede o limite da prévia");
    }
    html += decoder.decode(value, { stream: true });
  }
  return html + decoder.decode();
}

async function fetchPreviewPage(initialUrl: string, signal: AbortSignal) {
  let currentUrl = initialUrl;
  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    const safeUrl = await assertPublicUrl(currentUrl);
    const response = await fetch(safeUrl, {
      redirect: "manual",
      signal,
      headers: {
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",
        "User-Agent": "WhatsApp/2.24 VirtuosaCRM-LinkPreview",
      },
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || redirectCount === MAX_REDIRECTS) throw new Error("Redirecionamento inválido");
      currentUrl = new URL(location, safeUrl).toString();
      continue;
    }
    if (!response.ok) throw new Error(`Página respondeu ${response.status}`);
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.toLowerCase().includes("text/html") && !contentType.toLowerCase().includes("application/xhtml+xml")) {
      throw new Error("Conteúdo sem prévia HTML");
    }
    return { html: await readLimitedHtml(response), finalUrl: safeUrl.toString() };
  }
  throw new Error("Limite de redirecionamentos excedido");
}

export async function loadWhatsAppLinkPreview(text: string): Promise<WhatsAppLinkPreview | null> {
  const requestedUrl = firstWhatsAppLink(text);
  if (!requestedUrl) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PREVIEW_TIMEOUT_MS);
  try {
    const { html, finalUrl } = await fetchPreviewPage(requestedUrl, controller.signal);
    const parsed = parseLinkPreviewHtml(html, finalUrl);
    if (!parsed) return null;

    const thumbnailUrl = parsed.thumbnailUrl
      ? await assertPublicUrl(parsed.thumbnailUrl).then((url) => url.toString()).catch(() => null)
      : null;
    return {
      ...parsed,
      url: requestedUrl,
      thumbnailUrl,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
