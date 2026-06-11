import { useState, useCallback } from "react";
import { RefreshCw } from "lucide-react";
import { queryClient } from "@/lib/queryClient";

interface KpiRefreshButtonProps {
  queryKeys: readonly unknown[][];
  label: string;
  testId: string;
}

export default function KpiRefreshButton({ queryKeys, label, testId }: KpiRefreshButtonProps) {
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

  return (
    <button
      type="button"
      onClick={handleRefresh}
      disabled={refreshing}
      className="absolute top-2 right-2 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-gray-300 hover:bg-white/20 hover:text-white transition-all opacity-70 md:opacity-0 md:group-hover/kpi:opacity-100 md:focus-visible:opacity-100 disabled:opacity-100"
      data-testid={testId}
      title={label}
      aria-label={label}
    >
      <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
    </button>
  );
}
