"use client";

import { useRef, useState } from "react";
import { Loader2, Pause, Play, Send, Trash2 } from "lucide-react";
import { useCompatibleAudioSource } from "@/hooks/use-compatible-audio-source";
import { audioPlaybackErrorMessage } from "@/lib/whatsapp/audio-compatibility";

import {
  audioPlaybackRateLabel,
  formatAudioDuration,
  nextAudioPlaybackRate,
  type AudioPlaybackRate,
} from "@/lib/whatsapp/audio-playback";

type Props = {
  previewUrl: string;
  mimeType?: string;
  durationSeconds: number;
  isSending: boolean;
  onDiscard: () => void;
  onSend: () => void;
};

export function RecordedAudioPreview({
  previewUrl,
  mimeType,
  durationSeconds,
  isSending,
  onDiscard,
  onSend,
}: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(durationSeconds);
  const [playbackRate, setPlaybackRate] = useState<AudioPlaybackRate>(1);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const { audioSource, isPreparing, prepare } = useCompatibleAudioSource({
    mediaId: previewUrl,
    url: previewUrl,
    mimeType,
  });

  const togglePlayback = async () => {
    const audio = audioRef.current;
    if (!audio || isPreparing) return;

    if (audio.paused) {
      try {
        setPlaybackError(null);
        const source = await prepare();
        if (audioRef.current !== audio) return;
        if (audio.getAttribute("src") !== source) audio.src = source;
        audio.muted = false;
        audio.volume = 1;
        audio.playbackRate = playbackRate;
        await audio.play();
      } catch (error) {
        if (audioRef.current !== audio) return;
        setIsPlaying(false);
        setPlaybackError(audioPlaybackErrorMessage(error));
      }
      return;
    }

    audio.pause();
  };

  const cyclePlaybackRate = () => {
    const nextRate = nextAudioPlaybackRate(playbackRate);
    setPlaybackRate(nextRate);
    if (audioRef.current) audioRef.current.playbackRate = nextRate;
  };

  const safeDuration = Number.isFinite(duration) && duration > 0
    ? duration
    : Math.max(0, durationSeconds);

  return (
    <div
      className="inbox-composer-field flex min-h-12 flex-wrap items-center gap-1 rounded-xl px-1.5 shadow-sm sm:gap-2"
      aria-label="Prévia do áudio gravado"
    >
      <button
        type="button"
        onClick={onDiscard}
        disabled={isSending}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50 sm:h-10 sm:w-10"
        title="Excluir gravação"
        aria-label="Excluir gravação"
      >
        <Trash2 className="h-5 w-5" />
      </button>
      <button
        type="button"
        onClick={() => void togglePlayback()}
        disabled={isSending || isPreparing}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[#54656f] transition-colors hover:bg-black/5 hover:text-[#111b21] disabled:opacity-50 dark:text-[#aebac1] dark:hover:bg-white/10 dark:hover:text-[#e9edef] sm:h-10 sm:w-10"
        title={isPlaying ? "Pausar prévia" : "Ouvir gravação"}
        aria-label={isPreparing ? "Preparando áudio" : isPlaying ? "Pausar prévia" : "Ouvir gravação"}
      >
        {isPreparing ? <Loader2 className="h-5 w-5 animate-spin" /> : isPlaying ? <Pause className="h-5 w-5" /> : <Play className="ml-0.5 h-5 w-5" />}
      </button>
      <div className="min-w-0 flex-1 px-0.5">
        <input
          type="range"
          min={0}
          max={Math.max(1, safeDuration)}
          step={0.1}
          value={Math.min(currentTime, Math.max(1, safeDuration))}
          onChange={(event) => {
            const nextTime = Number(event.currentTarget.value);
            if (audioRef.current) audioRef.current.currentTime = nextTime;
            setCurrentTime(nextTime);
          }}
          className="h-5 w-full cursor-pointer accent-[#00a884]"
          aria-label="Posição da prévia do áudio"
        />
        <div className="flex items-center justify-between gap-2 text-[10px] leading-none text-muted-foreground">
          <span>Prévia</span>
          <span className="font-mono">
            {formatAudioDuration(currentTime)} / {formatAudioDuration(safeDuration)}
          </span>
        </div>
      </div>
      <button
        type="button"
        onClick={cyclePlaybackRate}
        disabled={isSending}
        className="flex h-11 min-w-12 shrink-0 items-center justify-center rounded-full px-2 text-xs font-semibold text-[#54656f] transition-colors hover:bg-black/5 hover:text-[#111b21] disabled:opacity-50 dark:text-[#aebac1] dark:hover:bg-white/10 dark:hover:text-[#e9edef] sm:h-10"
        title="Alterar velocidade"
        aria-label={`Velocidade ${audioPlaybackRateLabel(playbackRate)}. Alterar velocidade`}
      >
        {audioPlaybackRateLabel(playbackRate)}
      </button>
      <button
        type="button"
        onClick={onSend}
        disabled={isSending}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#00a884] text-white transition-colors hover:bg-[#06a17f] disabled:opacity-50 sm:h-10 sm:w-10"
        title="Enviar áudio"
        aria-label="Enviar áudio"
      >
        {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="ml-0.5 h-4 w-4" />}
      </button>
      {playbackError && (
        <p role="status" className="basis-full px-2 pb-2 text-xs leading-relaxed text-muted-foreground">{playbackError}</p>
      )}
      <audio
        ref={audioRef}
        preload="metadata"
        src={audioSource}
        onLoadedMetadata={(event) => {
          const nextDuration = event.currentTarget.duration;
          if (Number.isFinite(nextDuration) && nextDuration > 0) setDuration(nextDuration);
          event.currentTarget.playbackRate = playbackRate;
        }}
        onDurationChange={(event) => {
          const nextDuration = event.currentTarget.duration;
          if (Number.isFinite(nextDuration) && nextDuration > 0) setDuration(nextDuration);
        }}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
        onPlay={() => {
          setPlaybackError(null);
          setIsPlaying(true);
        }}
        onPause={() => setIsPlaying(false)}
        onEnded={(event) => {
          event.currentTarget.currentTime = 0;
          setCurrentTime(0);
          setIsPlaying(false);
        }}
        onError={() => {
          setIsPlaying(false);
          setPlaybackError(audioPlaybackErrorMessage());
        }}
        className="hidden"
      />
    </div>
  );
}
