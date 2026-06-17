// Best-effort frontend error reporter. Posts uncaught errors and unhandled
// promise rejections to the backend so platform admins can inspect frontend
// crashes. Never throws and silently ignores its own failures. Lightly
// throttled to avoid flooding the endpoint from a repeating error loop.

let lastSent = 0;
let sentCount = 0;
const MIN_INTERVAL_MS = 1000;
const MAX_REPORTS = 50;

function report(message: string, stack?: string, context?: Record<string, unknown>) {
  const now = Date.now();
  if (sentCount >= MAX_REPORTS) return;
  if (now - lastSent < MIN_INTERVAL_MS) return;
  lastSent = now;
  sentCount += 1;

  try {
    fetch("/api/client-errors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      keepalive: true,
      body: JSON.stringify({
        message: message.slice(0, 2000),
        stack: stack ? stack.slice(0, 10000) : undefined,
        path: window.location.pathname + window.location.search,
        context,
      }),
    }).catch(() => {});
  } catch {
    /* ignore */
  }
}

export function installErrorReporter() {
  window.addEventListener("error", (event) => {
    const err = event.error;
    report(
      err?.message || event.message || "Unknown error",
      err?.stack,
      { type: "error" },
    );
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    const message =
      reason instanceof Error
        ? reason.message
        : typeof reason === "string"
          ? reason
          : "Unhandled promise rejection";
    report(message, reason instanceof Error ? reason.stack : undefined, {
      type: "unhandledrejection",
    });
  });
}
