import { useRef, useState, type ReactNode } from "react";
import { Reply } from "lucide-react";

const TRIGGER = 56;
const MAX = 84;

interface SwipeToReplyProps {
  children: ReactNode;
  onReply: () => void;
  disabled?: boolean;
}

export default function SwipeToReply({ children, onReply, disabled }: SwipeToReplyProps) {
  const startX = useRef(0);
  const startY = useRef(0);
  const dir = useRef<"horizontal" | "vertical" | null>(null);
  const reached = useRef(false);
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);

  const handleTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    startX.current = t.clientX;
    startY.current = t.clientY;
    dir.current = null;
    reached.current = false;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const t = e.touches[0];
    const dx = t.clientX - startX.current;
    const dy = t.clientY - startY.current;

    if (!dir.current) {
      if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
        dir.current = Math.abs(dx) > Math.abs(dy) ? "horizontal" : "vertical";
      } else {
        return;
      }
    }

    if (dir.current === "vertical") return;

    if (dx <= 0) {
      if (offset !== 0) setOffset(0);
      return;
    }

    e.preventDefault();
    if (!dragging) setDragging(true);

    let next = dx;
    if (next > MAX) next = MAX + (next - MAX) * 0.2;
    setOffset(next);

    if (!reached.current && next >= TRIGGER) {
      reached.current = true;
      if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(12);
    } else if (reached.current && next < TRIGGER) {
      reached.current = false;
    }
  };

  const handleTouchEnd = () => {
    const shouldReply = dir.current === "horizontal" && offset >= TRIGGER;
    setDragging(false);
    setOffset(0);
    dir.current = null;
    reached.current = false;
    if (shouldReply) onReply();
  };

  const handleTouchCancel = () => {
    setDragging(false);
    setOffset(0);
    dir.current = null;
    reached.current = false;
  };

  if (disabled) return <>{children}</>;

  const progress = Math.min(offset / TRIGGER, 1);
  const active = offset >= TRIGGER;

  return (
    <div className="relative">
      <div
        className="absolute inset-y-0 left-1 flex items-center pointer-events-none md:hidden"
        style={{ opacity: progress }}
        aria-hidden
      >
        <div
          className={`flex items-center justify-center h-9 w-9 rounded-full transition-colors ${active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
          style={{ transform: `scale(${0.5 + progress * 0.5})` }}
        >
          <Reply className="h-4 w-4" />
        </div>
      </div>
      <div
        style={{
          transform: offset !== 0 ? `translateX(${offset}px)` : undefined,
          transition: dragging ? "none" : "transform 0.25s cubic-bezier(0.25,0.46,0.45,0.94)",
          touchAction: "pan-y",
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchCancel}
      >
        {children}
      </div>
    </div>
  );
}
