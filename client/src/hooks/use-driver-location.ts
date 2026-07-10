import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useUser } from "@/context/UserContext";
import { apiRequest } from "@/lib/queryClient";
import type { DeliveryAssignmentWithDetails } from "@shared/schema";

const POST_INTERVAL_MS = 20_000;

/**
 * While the driver has an active stop (en_route / arriving), watch the device
 * GPS and post the position every ~20s so the restaurant tracking view and the
 * office fleet map stay live. Mount once in the driver shell.
 */
export function useDriverLocation() {
  const { isDriver } = useUser();

  const { data: deliveries } = useQuery<DeliveryAssignmentWithDetails[]>({
    queryKey: ["/api/driver/deliveries"],
    enabled: isDriver,
    refetchInterval: 30_000,
  });

  const active = !!deliveries?.some((d) => d.status === "en_route" || d.status === "arriving");
  const lastSentRef = useRef(0);

  useEffect(() => {
    if (!isDriver || !active) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) return;

    const send = (pos: GeolocationPosition) => {
      const now = Date.now();
      if (now - lastSentRef.current < POST_INTERVAL_MS) return;
      lastSentRef.current = now;
      const { latitude, longitude, heading, speed } = pos.coords;
      apiRequest("POST", "/api/driver/location", {
        latitude,
        longitude,
        heading: Number.isFinite(heading as number) ? Math.round(((heading as number) + 360) % 360) : null,
        speedKmh: Number.isFinite(speed as number) && (speed as number) >= 0 ? Math.round((speed as number) * 3.6) : null,
      }).catch(() => {});
    };

    const watchId = navigator.geolocation.watchPosition(send, () => {}, {
      enableHighAccuracy: true,
      maximumAge: 15_000,
      timeout: 20_000,
    });
    return () => navigator.geolocation.clearWatch(watchId);
  }, [isDriver, active]);
}
