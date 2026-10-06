const PRIVATE_BLOB_HOST_SUFFIX = ".private.blob.vercel-storage.com";

export function isPrivateBlobUrl(value?: string | null) {
  try {
    const url = new URL(value || "");
    return url.protocol === "https:" && url.hostname.endsWith(PRIVATE_BLOB_HOST_SUFFIX);
  } catch {
    return false;
  }
}

export function shouldDiscardTemporaryEvolutionMediaUrl(
  provider: string | null | undefined,
  value?: string | null,
) {
  const url = value?.trim();
  return provider?.toLowerCase() === "evolution" &&
    Boolean(url && !url.startsWith("data:") && !isPrivateBlobUrl(url));
}

export function needsEvolutionMediaDownload(
  provider: string | null | undefined,
  storedUrl?: string | null,
  incomingUrl?: string | null,
) {
  if (provider?.toLowerCase() !== "evolution") return false;
  if (isPrivateBlobUrl(storedUrl) || storedUrl?.startsWith("data:")) return false;
  return !incomingUrl?.startsWith("data:");
}
