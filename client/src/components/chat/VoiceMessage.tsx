import { useEffect, useRef, useState } from "react";
import { Play, Pause } from "lucide-react";
import { Button } from "@/components/ui/button";

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

export function VoiceMessage({ src, durationMs, testId }: VoiceMessageProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentMs, setCurrentMs] = useState(0);
  const [totalMs, setTotalMs] = useState(durationMs ?? 0);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onTime = () => setCurrentMs(a.currentTime * 1000);
    const onLoaded = () => {
      if (Number.isFinite(a.duration) && a.duration > 0) setTotalMs(a.duration * 1000);
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
  const remaining = totalMs > 0 ? Math.max(0, totalMs - currentMs) : 0;

  return (
    <div className="flex items-center gap-2 min-w-[180px]" data-testid={testId || "voice-message"}>
      <Button
        type="button"
        size="icon"
        variant="secondary"
        className="h-9 w-9 rounded-full shrink-0"
        onClick={toggle}
        data-testid={`${testId || "voice-message"}-toggle`}
      >
        {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
      </Button>
      <div className="flex-1 min-w-0">
        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
          <div className="h-full bg-primary transition-[width] duration-150" style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-1 text-[10px] text-muted-foreground tabular-nums">
          {playing || currentMs > 0 ? formatTime(currentMs) : "0:00"} / {formatTime(totalMs || 0)}
          {totalMs > 0 && remaining > 0 && !playing && currentMs === 0 ? "" : ""}
        </div>
      </div>
      <audio ref={audioRef} src={src} preload="metadata" />
    </div>
  );
}
