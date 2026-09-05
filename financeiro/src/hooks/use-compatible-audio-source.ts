"use client";

import { useEffect, useRef, useState } from "react";
import { isWebmAudio, remuxWebmAudioForPlayback } from "@/lib/whatsapp/audio-compatibility";

export function useCompatibleAudioSource({
  mediaId,
  url,
  mimeType,
  fileName,
}: {
  mediaId: string;
  url?: string | null;
  mimeType?: string | null;
  fileName?: string | null;
}) {
  const needsRemux = isWebmAudio(mimeType, url, fileName);
  const latestUrl = useRef(url);
  latestUrl.current = url;
  const prepared = useRef<{ id: string; url: string } | null>(null);
  const operation = useRef<{ id: string; controller: AbortController; promise: Promise<string> } | null>(null);
  const [preparingMediaId, setPreparingMediaId] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      operation.current?.controller.abort();
      operation.current = null;
      if (prepared.current) URL.revokeObjectURL(prepared.current.url);
      prepared.current = null;
    };
  }, [mediaId]);

  const prepare = async () => {
    const sourceUrl = latestUrl.current;
    if (!sourceUrl) throw new Error("Arquivo de áudio indisponível.");
    if (!needsRemux) return sourceUrl;
    if (prepared.current?.id === mediaId) return prepared.current.url;
    if (operation.current?.id === mediaId) return operation.current.promise;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);
    setPreparingMediaId(mediaId);
    const promise = (async () => {
      try {
        const response = await fetch(sourceUrl, { signal: controller.signal });
        if (!response.ok) throw new Error(`Não foi possível carregar o áudio (${response.status}).`);
        const compatibleBlob = await remuxWebmAudioForPlayback(await response.blob(), controller.signal);
        controller.signal.throwIfAborted();
        const compatibleUrl = URL.createObjectURL(compatibleBlob);
        prepared.current = { id: mediaId, url: compatibleUrl };
        return compatibleUrl;
      } finally {
        clearTimeout(timeout);
        if (operation.current?.controller === controller) {
          operation.current = null;
          setPreparingMediaId(null);
        }
      }
    })();
    operation.current = { id: mediaId, controller, promise };
    return promise;
  };

  return {
    // O player atribui o Blob uma vez, antes de play(). Reatribuir src pelo React
    // durante essa reprodução dispara load() e pode abortar o áudio no WebKit.
    audioSource: needsRemux ? undefined : url || undefined,
    isPreparing: preparingMediaId === mediaId,
    prepare,
  };
}
