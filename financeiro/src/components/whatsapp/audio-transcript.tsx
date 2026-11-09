"use client";

export type AudioTranscriptView = { status: string; text: string | null; durationMs: number | null };

/** Texto de apoio interno; não altera o balão nem o arquivo de voz original. */
export function AudioTranscript({ transcript }: { transcript?: AudioTranscriptView | null }) {
  if (!transcript) return null;
  if (transcript.status !== "ready" || !transcript.text) return (
    <p className="mt-2 max-w-prose text-sm leading-relaxed text-foreground" role="status">
      {transcript.status === "processing" ? "A Alice está transcrevendo este áudio." : "A transcrição não foi concluída. A equipe precisa ouvir este áudio para continuar."}
    </p>
  );
  return (
    <details className="mt-2 min-w-0 max-w-prose text-sm text-foreground" data-audio-transcript>
      <summary className="flex min-h-11 cursor-pointer items-center rounded-md px-1 font-medium underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
        Ver transcrição do áudio
      </summary>
      <p className="mt-1 whitespace-pre-wrap break-words leading-relaxed [overflow-wrap:anywhere]">{transcript.text}</p>
      <p className="mt-2 text-xs leading-relaxed">Transcrição automática para uso interno. Confira o áudio se houver dúvida.</p>
    </details>
  );
}
