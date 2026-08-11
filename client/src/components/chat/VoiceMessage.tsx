import { useEffect, useRef, useState } from "react";
import { Play, Pause } from "lucide-react";
import { Button } from "@/components/ui/button";

// Number of amplitude bars shown in the waveform.
const BAR_COUNT = 40;
// Minimum / maximum rendered bar height in px (container is 32 px tall).
const MIN_H = 3;
const MAX_H = 28;

interface VoiceMessageProps {
  src: string;
  durationMs?: number | null;
  testId?: string;
}

function formatTime(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

/**
 * Fetch the audio file, decode it with the Web Audio API, and return
 * BAR_COUNT normalised amplitude values (0–1).  Any error yields an empty
 * array so the component gracefully falls back to the flat progress bar.
 */
async function decodeWaveform(src: string): Promise<number[]> {
  const response = await fetch(src);
  const arrayBuffer = await response.arrayBuffer();
  const ctx = new AudioContext();
  try {
    const decoded = await ctx.decodeAudioData(arrayBuffer);
    const data = decoded.getChannelData(0);
    const chunkSize = Math.max(1, Math.floor(data.length / BAR_COUNT));
    const raw: number[] = [];
    for (let i = 0; i < BAR_COUNT; i++) {
      const start = i * chunkSize;
      const end = Math.min(start + chunkSize, data.length);
      let sum = 0;
      for (let j = start; j < end; j++) sum += Math.abs(data[j]);
      raw.push(sum / (end - start));
    }
    const peak = Math.max(...raw, 0.001);
    return raw.map((v) => v / peak);
  } finally {
    ctx.close();
  }
}

export function VoiceMessage({ src, durationMs, testId }: VoiceMessageProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentMs, setCurrentMs] = useState(0);
  const [totalMs, setTotalMs] = useState(durationMs ?? 0);
  const [bars, setBars] = useState<number[]>([]);

  // Wire audio element events.
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onTime = () => setCurrentMs(a.currentTime * 1000);
    const onLoaded = () => {
      if (Number.isFinite(a.duration) && a.duration > 0)
        setTotalMs(a.duration * 1000);
    };
    const onEnded = () => {
      setPlaying(false);
      setCurrentMs(0);
    };
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("loadedmetadata", onLoaded);
    a.addEventListener("ended", onEnded);
    return () => {
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("loadedmetadata", onLoaded);
      a.removeEventListener("ended", onEnded);
    };
  }, []);

  // Decode waveform on mount (or when src changes).
  useEffect(() => {
    let cancelled = false;
    decodeWaveform(src)
      .then((decoded) => { if (!cancelled) setBars(decoded); })
      .catch(() => {}); // silently fall back to flat bar
    return () => { cancelled = true; };
  }, [src]);

  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (playing) {
      a.pause();
      setPlaying(false);
    } else {
      a.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    }
  };

  const pct = totalMs > 0 ? Math.min(100, (currentMs / totalMs) * 100) : 0;

  /** Click anywhere on the waveform → seek to that position. */
  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const fraction = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const a = audioRef.current;
    if (a && totalMs > 0) {
      a.currentTime = (fraction * totalMs) / 1000;
      setCurrentMs(fraction * totalMs);
    }
  };

  return (
    <div
      className="flex items-center gap-2 min-w-[180px]"
      data-testid={testId ?? "voice-message"}
    >
      {/* Play / Pause button */}
      <Button
        type="button"
        size="icon"
        variant="secondary"
        className="h-9 w-9 rounded-full shrink-0"
        onClick={toggle}
        data-testid={`${testId ?? "voice-message"}-toggle`}
      >
        {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
      </Button>

      <div className="flex-1 min-w-0">
        {bars.length > 0 ? (
          /* ── Waveform ─────────────────────────────────────────────── */
          <div
            className="h-8 flex items-center gap-[2px] cursor-pointer select-none"
            onClick={handleSeek}
            role="slider"
            aria-label="Voice message position"
            aria-valuenow={Math.round(pct)}
            aria-valuemin={0}
            aria-valuemax={100}
            data-testid={`${testId ?? "voice-message"}-waveform`}
          >
            {bars.map((amp, i) => {
              // A bar is "played" when its right edge has passed the current position.
              const barRightPct = ((i + 1) / BAR_COUNT) * 100;
              const played = barRightPct <= pct;
              const heightPx = MIN_H + amp * (MAX_H - MIN_H);
              return (
                <div
                  key={i}
                  className={`flex-1 rounded-full transition-colors duration-75 ${
                    played ? "bg-primary" : "bg-muted-foreground/30"
                  }`}
                  style={{ height: `${heightPx}px` }}
                />
              );
            })}
          </div>
        ) : (
          /* ── Fallback flat bar (while waveform is loading / unavailable) */
          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-primary transition-[width] duration-150"
              style={{ width: `${pct}%` }}
            />
          </div>
        )}

        {/* Timestamp */}
        <div className="mt-1 text-[10px] text-muted-foreground tabular-nums">
          {playing || currentMs > 0 ? formatTime(currentMs) : "0:00"} /{" "}
          {formatTime(totalMs)}
        </div>
      </div>

      <audio ref={audioRef} src={src} preload="metadata" />
    </div>
  );
}
