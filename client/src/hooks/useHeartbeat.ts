import { useEffect, useRef } from "react";
import { apiRequest } from "@/lib/queryClient";

export function useHeartbeat(userId: string | undefined, intervalMs = 30000) {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!userId) return;

    const sendHeartbeat = async () => {
      try {
        await apiRequest("POST", "/api/heartbeat", { userId });
      } catch {}
    };

    sendHeartbeat();
    intervalRef.current = setInterval(sendHeartbeat, intervalMs);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [userId, intervalMs]);
}
