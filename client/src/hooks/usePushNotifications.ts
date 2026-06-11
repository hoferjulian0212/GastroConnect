import { useState, useEffect, useCallback } from "react";
import { apiRequest } from "@/lib/queryClient";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function detectIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const isiOSDevice = /iPad|iPhone|iPod/.test(ua);
  // iPadOS 13+ reports as Mac but is touch-capable
  const isiPadOS = navigator.platform === "MacIntel" && (navigator as any).maxTouchPoints > 1;
  return isiOSDevice || isiPadOS;
}

function detectStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)")?.matches === true ||
    (window.navigator as any).standalone === true
  );
}

export function usePushNotifications(userId: string | undefined) {
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof Notification !== "undefined" ? Notification.permission : "default"
  );
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    setIsSupported(supported);
    setIsIOS(detectIOS());
    setIsStandalone(detectStandalone());

    if (supported) {
      // Make sure the service worker is registered & up to date so pushes are received.
      navigator.serviceWorker.register("/sw.js").catch(() => {});
      navigator.serviceWorker.getRegistration("/sw.js").then(async (reg) => {
        if (reg) {
          const sub = await reg.pushManager.getSubscription();
          setIsSubscribed(!!sub);
        }
      });
    }
  }, []);

  const subscribe = useCallback(async () => {
    if (!userId || !isSupported) return false;

    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") return false;

      const registration = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;

      const res = await fetch("/api/push/vapid-key");
      const { publicKey } = await res.json();
      if (!publicKey) return false;

      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
      }

      await apiRequest("POST", "/api/push/subscribe", {
        userId,
        subscription: subscription.toJSON(),
      });

      setIsSubscribed(true);
      return true;
    } catch (error) {
      console.error("Push subscription failed:", error);
      return false;
    }
  }, [userId, isSupported]);

  const unsubscribe = useCallback(async () => {
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      if (reg) {
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await apiRequest("POST", "/api/push/unsubscribe", {
            endpoint: sub.endpoint,
          });
          await sub.unsubscribe();
        }
      }
      setIsSubscribed(false);
    } catch (error) {
      console.error("Push unsubscribe failed:", error);
    }
  }, []);

  const sendTest = useCallback(async () => {
    if (!userId) return false;
    try {
      const res = await apiRequest("POST", "/api/push/test", { userId });
      const data = await res.json();
      return data?.sent > 0;
    } catch (error) {
      console.error("Push test failed:", error);
      return false;
    }
  }, [userId]);

  // iOS only supports Web Push from an installed (home-screen) PWA.
  const needsInstall = isIOS && !isStandalone;

  return { isSupported, permission, isSubscribed, isIOS, isStandalone, needsInstall, subscribe, unsubscribe, sendTest };
}
