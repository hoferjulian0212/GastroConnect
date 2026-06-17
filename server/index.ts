import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { runMonthlyReportsForAll } from "./monthlyReportService";
import { createServer } from "http";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { createSessionMiddleware } from "./auth/session";
import { loadAuth } from "./auth/middleware";
import { storage } from "./storage";

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: false,
    frameguard: false,
  })
);

app.set("trust proxy", 1);

// CORS lockdown. The frontend is served same-origin (Vite + Express on one
// port), so by default NO cross-origin credentialed requests are allowed —
// the browser's same-origin policy already blocks them and we add no
// Access-Control-Allow-Origin header. To permit a specific external origin
// (e.g. a separate prod frontend host), set ALLOWED_ORIGINS to a
// comma-separated allowlist; only those origins get credentialed CORS.
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Vary", "Origin");
    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET,HEAD,POST,PATCH,PUT,DELETE,OPTIONS",
    );
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization",
    );
    if (req.method === "OPTIONS") {
      return res.sendStatus(204);
    }
  } else if (origin && req.method === "OPTIONS") {
    // Disallowed cross-origin preflight: reject without CORS headers.
    return res.sendStatus(403);
  }
  next();
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Zu viele Anfragen. Bitte versuchen Sie es später erneut." },
  validate: { trustProxy: false, xForwardedForHeader: false, ip: false },
});

const writeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Zu viele Anfragen. Bitte versuchen Sie es später erneut." },
  validate: { trustProxy: false, xForwardedForHeader: false, ip: false },
});

app.use("/api", apiLimiter);

app.use("/api", (req, _res, next) => {
  if (req.method !== "GET" && req.method !== "HEAD" && req.method !== "OPTIONS") {
    return writeLimiter(req, _res, next);
  }
  next();
});

app.use("/api", (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  next();
});

app.use(
  express.json({
    limit: "1mb",
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false, limit: "1mb" }));

// Server-side sessions + per-request auth context (member + org + role). Mounted
// on /api only since all authentication and protected routes live under /api.
app.use("/api", createSessionMiddleware());
app.use("/api", loadAuth);

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  await registerRoutes(httpServer, app);

  app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    // Persist the error for platform admins (best-effort, never throws).
    storage
      .createErrorLog({
        level: "error",
        source: "server",
        message: String(message).slice(0, 2000),
        stack: err?.stack ? String(err.stack).slice(0, 10000) : null,
        method: req.method,
        path: req.originalUrl?.slice(0, 500) ?? null,
        statusCode: status,
        userId: req.auth?.organizationId ?? null,
        memberId: req.auth?.memberId ?? null,
        userAgent: req.headers["user-agent"]?.slice(0, 500) ?? null,
        context: null,
      })
      .catch(() => {});

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    },
  );

  // ── Monthly comparison report scheduler (Task #45) ──────────────────────
  // Run daily; if today is the 1st (server-local time), generate previous-
  // month reports for every opted-in restaurant. The service itself skips
  // months that already have a report, so duplicate runs are safe.
  let lastRunYearMonth = "";
  const runIfFirstOfMonth = async () => {
    const now = new Date();
    // Standardize on UTC so scheduler and report month math (which uses UTC)
    // agree at day boundaries.
    if (now.getUTCDate() !== 1) return;
    const tag = `${now.getUTCFullYear()}-${now.getUTCMonth() + 1}`;
    if (tag === lastRunYearMonth) return;
    try {
      log("[monthly-report] running scheduled batch", "scheduler");
      const result = await runMonthlyReportsForAll();
      // Only mark this month as "done" after a successful batch — failures
      // (DB hiccup, GCS auth flake) will be retried on the next 6h tick.
      lastRunYearMonth = tag;
      log(`[monthly-report] generated=${result.generated} skipped=${result.skipped} failed=${result.failed}`, "scheduler");
    } catch (err) {
      console.error("[monthly-report] scheduled batch failed:", err);
    }
  };
  setTimeout(() => { runIfFirstOfMonth(); }, 30_000);
  setInterval(() => { runIfFirstOfMonth(); }, 6 * 60 * 60 * 1000);
})();
