import { head, issueSignedToken, presignUrl } from "@vercel/blob";
export { WHATSAPP_MEDIA_MAX_BATCH_FILES, WHATSAPP_MEDIA_MAX_FILE_BYTES } from "./media-constraints";

const PRIVATE_BLOB_HOST_SUFFIX = ".private.blob.vercel-storage.com";
const SIGNED_TOKEN_TTL_MS = 60 * 60 * 1000;
const SIGNED_TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000;
const DEFAULT_READ_URL_TTL_MS = 15 * 60 * 1000;

type CachedSignedToken = Awaited<ReturnType<typeof issueSignedToken>>;

let cachedReadToken: CachedSignedToken | null = null;
let cachedReadTokenPromise: Promise<CachedSignedToken> | null = null;

export function privateBlobPathname(value?: string | null) {
  const clean = (value || "").trim();
  if (!clean) return null;

  try {
    const url = new URL(clean);
    if (url.protocol !== "https:" || !url.hostname.endsWith(PRIVATE_BLOB_HOST_SUFFIX)) return null;
    return decodeURIComponent(url.pathname.replace(/^\/+/, ""));
  } catch {
    return null;
  }
}

export function isPrivateBlobUrl(value?: string | null) {
  return privateBlobPathname(value) !== null;
}

async function getCachedReadToken() {
  const now = Date.now();
  if (cachedReadToken && cachedReadToken.validUntil - SIGNED_TOKEN_REFRESH_MARGIN_MS > now) {
    return cachedReadToken;
  }

  if (!cachedReadTokenPromise) {
    cachedReadTokenPromise = issueSignedToken({
      pathname: "*",
      operations: ["get"],
      validUntil: now + SIGNED_TOKEN_TTL_MS,
    }).then((token) => {
      cachedReadToken = token;
      return token;
    }).finally(() => {
      cachedReadTokenPromise = null;
    });
  }

  return cachedReadTokenPromise;
}

export async function createPrivateBlobReadUrl(value: string, ttlMs = DEFAULT_READ_URL_TTL_MS) {
  const pathname = privateBlobPathname(value);
  if (!pathname) return value;

  const token = await getCachedReadToken();
  const validUntil = Math.min(Date.now() + ttlMs, token.validUntil);
  const { presignedUrl } = await presignUrl(token, {
    access: "private",
    operation: "get",
    pathname,
    validUntil,
  });
  return presignedUrl;
}

export async function inspectPrivateBlob(value: string) {
  const pathname = privateBlobPathname(value);
  if (!pathname) return null;
  const metadata = await head(value);
  return { ...metadata, pathname };
}

export async function signPrivateMediaUrls<T extends { mediaUrl?: string | null }>(items: T[]) {
  if (!items.some((item) => isPrivateBlobUrl(item.mediaUrl))) return items;

  try {
    return await Promise.all(items.map(async (item) => {
      if (!isPrivateBlobUrl(item.mediaUrl)) return item;
      return {
        ...item,
        mediaUrl: await createPrivateBlobReadUrl(item.mediaUrl || ""),
      };
    }));
  } catch (error) {
    console.error("[WhatsApp Media Storage] Não foi possível assinar os anexos privados:", error);
    return items.map((item) => isPrivateBlobUrl(item.mediaUrl)
      ? { ...item, mediaUrl: null }
      : item);
  }
}
