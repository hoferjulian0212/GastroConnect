import { useEffect, useRef, useState } from "react";
import { Mic, Trash2, Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface VoiceRecorderProps {
  onSend: (blob: Blob, durationMs: number) => void | Promise<void>;
  isSending?: boolean;
  lang?: "de" | "it";
}

function formatTime(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

export function VoiceRecorder({ onSend, isSending, lang = "de" }: VoiceRecorderProps) {
  const [recording, setRecording] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [levels, setLevels] = useState<number[]>([]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const startRef = useRef<number>(0);
  const tickRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const cancelledRef = useRef(false);
  const { toast } = useToast();

  const stopAll = () => {
    if (tickRef.current) {
      window.clearInterval(tickRef.current);
      tickRef.current = null;
    }
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
      analyserRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  };

  useEffect(() => () => stopAll(), []);

  const start = async () => {
    if (recording) return;
    cancelledRef.current = false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mr = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm" });
      mediaRecorderRef.current = mr;
      chunksRef.current = [];
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      mr.onstop = async () => {
        const duration = Date.now() - startRef.current;
        stopAll();
        setRecording(false);
        setElapsedMs(0);
        setLevels([]);
        if (cancelledRef.current) return;
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || "audio/webm" });
        if (blob.size < 200 || duration < 300) {
          toast({ title: lang === "de" ? "Zu kurz" : "Troppo breve", description: lang === "de" ? "Halten Sie das Mikrofon gedrückt." : "Tieni premuto il microfono." });
          return;
        }
        await onSend(blob, duration);
      };
      startRef.current = Date.now();
      mr.start();
      setRecording(true);

      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new Ctx();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tickAnim = () => {
        if (!analyserRef.current) return;
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / data.length);
        setLevels((prev) => {
          const next = [...prev, Math.min(1, rms * 3)];
          return next.length > 32 ? next.slice(next.length - 32) : next;
        });
        rafRef.current = requestAnimationFrame(tickAnim);
      };
      rafRef.current = requestAnimationFrame(tickAnim);

      tickRef.current = window.setInterval(() => {
        setElapsedMs(Date.now() - startRef.current);
      }, 100);
    } catch (e: any) {
      toast({ title: lang === "de" ? "Mikrofon-Fehler" : "Errore microfono", description: e?.message || "permission denied", variant: "destructive" });
      stopAll();
      setRecording(false);
    }
  };

  const stop = (cancel: boolean) => {
    cancelledRef.current = cancel;
    const mr = mediaRecorderRef.current;
    if (mr && mr.state !== "inactive") {
      try { mr.stop(); } catch {}
    } else {
      stopAll();
      setRecording(false);
      setElapsedMs(0);
      setLevels([]);
    }
  };

  if (!recording) {
    return (
      <Button
        type="button"
        variant="secondary"
        size="icon"
        className="rounded-full shrink-0 h-12 w-12 md:h-10 md:w-10"
        onClick={start}
        disabled={isSending}
        aria-label={lang === "de" ? "Sprachnachricht aufnehmen" : "Registra messaggio vocale"}
        data-testid="button-voice-record"
      >
        {isSending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Mic className="h-5 w-5" />}
      </Button>
    );
  }

  return (
    <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-full bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 min-h-12" data-testid="voice-recorder-active">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8 rounded-full text-red-600"
        onClick={() => stop(true)}
        aria-label={lang === "de" ? "Abbrechen" : "Annulla"}
        data-testid="button-voice-cancel"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
      <span className="text-xs font-medium text-red-600 dark:text-red-400 tabular-nums shrink-0" data-testid="voice-recorder-time">
        ● {formatTime(elapsedMs)}
      </span>
      <div className="flex-1 flex items-center gap-[2px] h-6 overflow-hidden">
        {levels.map((l, i) => (
          <span
            key={i}
            className="w-1 bg-red-500/80 rounded-full"
            style={{ height: `${Math.max(8, l * 100)}%` }}
          />
        ))}
      </div>
      <Button
        type="button"
        variant="default"
        size="icon"
        className="h-9 w-9 rounded-full shrink-0"
        onClick={() => stop(false)}
        disabled={isSending}
        aria-label={lang === "de" ? "Senden" : "Invia"}
        data-testid="button-voice-send"
      >
        {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
      </Button>
    </div>
  );
}
