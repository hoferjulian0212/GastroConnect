import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh";

interface PullToRefreshWrapperProps {
  onRefresh: () => Promise<void>;
  children: React.ReactNode;
  className?: string;
}

export default function PullToRefreshWrapper({ onRefresh, children, className }: PullToRefreshWrapperProps) {
  const { containerRef, pullDistance, isRefreshing, isPulling, progress } = usePullToRefresh({ onRefresh });

  const active = pullDistance > 0 || isRefreshing;
  // Keep the transform applied briefly after release so the content animates
  // back to rest instead of snapping. When fully idle we drop the transform
  // entirely so it never creates a containing block that would break the
  // `position: fixed`/`sticky` elements some pages render on mobile.
  const [settling, setSettling] = useState(false);
  const hasPulledRef = useRef(false);
  useEffect(() => {
    if (active) {
      hasPulledRef.current = true;
      setSettling(false);
      return;
    }
    // Only animate back (and briefly keep the transform) after a real pull —
    // never on initial mount, so idle pages are truly transform-free.
    if (!hasPulledRef.current) return;
    setSettling(true);
    const t = setTimeout(() => setSettling(false), 340);
    return () => clearTimeout(t);
  }, [active]);

  const showTransform = active || settling;
  const ease = "transform 0.34s cubic-bezier(0.25, 0.46, 0.45, 0.94)";

  return (
    <div ref={containerRef} className={`relative ${className || ""}`}>
      {/* Refresh indicator: sits in the space revealed above the content as it
          is dragged down, so it is never hidden behind the dark header. Mobile only. */}
      {active && (
        <div
          className="md:hidden pointer-events-none absolute left-0 right-0 top-0 z-20 flex justify-center"
          style={{
            transform: `translateY(${Math.max(pullDistance - 44, 6)}px)`,
            transition: isPulling ? "none" : ease,
          }}
        >
          <div
            className={`flex h-9 w-9 items-center justify-center rounded-full border border-border bg-background shadow-sm ${isRefreshing ? "animate-pull-spin" : ""}`}
            style={{
              opacity: isRefreshing ? 1 : Math.min(progress * 1.3, 1),
              transform: `scale(${isRefreshing ? 1 : 0.5 + progress * 0.5})`,
            }}
          >
            <RefreshCw
              className="h-4 w-4 text-primary"
              style={{ transform: isRefreshing ? undefined : `rotate(${progress * 270}deg)` }}
            />
          </div>
        </div>
      )}
      <div
        style={
          showTransform
            ? {
                transform: `translateY(${pullDistance}px)`,
                transition: isPulling ? "none" : ease,
                willChange: "transform",
              }
            : undefined
        }
      >
        {children}
      </div>
    </div>
  );
}
