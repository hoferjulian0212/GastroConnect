import { RefreshCw } from "lucide-react";
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh";

interface PullToRefreshWrapperProps {
  onRefresh: () => Promise<void>;
  children: React.ReactNode;
  className?: string;
}

export default function PullToRefreshWrapper({ onRefresh, children, className }: PullToRefreshWrapperProps) {
  const { containerRef, pullDistance, isRefreshing, progress } = usePullToRefresh({ onRefresh });

  return (
    <div ref={containerRef} className={`relative ${className || ""}`}>
      {pullDistance > 0 && (
        <div
          className="absolute top-0 left-0 right-0 flex justify-center z-10 pointer-events-none md:hidden"
          style={{ transform: `translateY(${pullDistance - 40}px)` }}
        >
          <div className={`flex items-center justify-center h-8 w-8 rounded-full bg-primary/10 border border-primary/20 ${isRefreshing ? "animate-pull-spin" : ""}`}>
            <RefreshCw
              className="h-4 w-4 text-primary"
              style={{
                transform: isRefreshing ? undefined : `rotate(${progress * 270}deg)`,
                opacity: progress,
              }}
            />
          </div>
        </div>
      )}
      {children}
    </div>
  );
}
