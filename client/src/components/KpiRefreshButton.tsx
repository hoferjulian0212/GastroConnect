import { useState, useCallback } from "react";
import { RefreshCw } from "lucide-react";
import { queryClient } from "@/lib/queryClient";

interface KpiRefreshButtonProps {
  queryKeys: readonly unknown[][];
  label: string;
  testId: string;
  variant?: "dark" | "card";
}

export default function KpiRefreshButton({ queryKeys, label, testId, variant = "dark" }: KpiRefreshButtonProps) {
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = useCallback(async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (refreshing || !queryKeys || queryKeys.length === 0) return;
    setRefreshing(true);
    try {
      await Promise.all([
        ...queryKeys.map((key) => queryClient.invalidateQueries({ queryKey: key as unknown[] })),
        new Promise((resolve) => setTimeout(resolve, 500)),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [queryKeys, refreshing]);

  const variantClass =
    variant === "card"
      ? "h-6 w-6 bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground opacity-70"
      : "h-7 w-7 bg-white/10 text-gray-300 hover:bg-white/20 hover:text-white opacity-70 md:opacity-0 md:group-hover/kpi:opacity-100 md:focus-visible:opacity-100";

  return (
    <button
      type="button"
      onClick={handleRefresh}
      disabled={refreshing}
      className={`absolute top-2 right-2 z-10 flex items-center justify-center rounded-full transition-all disabled:opacity-100 ${variantClass}`}
      data-testid={testId}
      title={label}
      aria-label={label}
    >
      <RefreshCw className={`${variant === "card" ? "h-3 w-3" : "h-3.5 w-3.5"} ${refreshing ? "animate-spin" : ""}`} />
    </button>
  );
}
