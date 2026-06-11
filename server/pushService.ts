import webpush from "web-push";
import { storage } from "./storage";

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || "";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "";
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:info@gastroconnect.app";

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

function maskEndpoint(endpoint: string): string {
  if (!endpoint) return "";
  const tail = endpoint.slice(-12);
  return `…${tail}`;
}

export async function sendPushNotification(userId: string, payload: { title: string; message: string; url?: string; type?: string }) {
  const result = { attempted: 0, succeeded: 0, failed: 0 };
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return result;

  let subscriptions;
  try {
    subscriptions = await storage.getPushSubscriptions(userId);
  } catch (err: any) {
    console.error("[push] failed to load subscriptions", { userId, type: payload.type, error: err?.message });
    return result;
  }
  if (subscriptions.length === 0) return result;

  const pushPayload = JSON.stringify({
    title: payload.title,
    body: payload.message,
    url: payload.url || "/",
    type: payload.type || "general",
  });

  for (const sub of subscriptions) {
    result.attempted++;
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        pushPayload
      );
      result.succeeded++;
    } catch (error: any) {
      result.failed++;
      const statusCode = error?.statusCode;
      const ctx = {
        userId,
        type: payload.type,
        endpoint: maskEndpoint(sub.endpoint),
        statusCode,
        message: error?.body || error?.message || String(error),
      };
      if (statusCode === 410 || statusCode === 404) {
        try {
          await storage.deletePushSubscription(sub.endpoint);
          console.warn("[push] removed dead subscription", ctx);
        } catch (delErr: any) {
          console.error("[push] failed to remove dead subscription", { ...ctx, deleteError: delErr?.message });
        }
      } else {
        console.error("[push] delivery failed", ctx);
      }
    }
  }

  return result;
}

export { VAPID_PUBLIC_KEY };
