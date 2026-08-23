import express, { type Request, Response, NextFunction } from "express";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import { registerPublicStatsRoute, registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { runMonthlyReportsForAll } from "./monthlyReportService";
import { createServer } from "http";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { createSessionMiddleware } from "./auth/session";
import { loadAuth } from "./auth/middleware";
import { storage } from "./storage";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

// Clerk proxy must be mounted BEFORE body parsers (streams raw bytes).
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: false,
    frameguard: false,
  })
);

app.set("trust proxy", 1);

// CORS lockdown for explicit allowlist (keeps existing cross-origin policy).
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

// Shared-cacheable aggregate metrics must bypass Clerk and express-session:
// a rolling session cookie on a `Cache-Control: public` response could be
// stored and replayed by a shared cache.
registerPublicStatsRoute(app);

app.use(
  express.json({
    limit: "1mb",
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false, limit: "1mb" }));

// Clerk middleware: validates the Clerk session cookie and populates auth on
// every request. Resolves the publishable key from the incoming host so the
// same server can serve multiple Clerk custom domains.
app.use(
  clerkMiddleware((req) => ({
    publishableKey: publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env.CLERK_PUBLISHABLE_KEY,
    ),
  })),
);

// Express-session (Postgres-backed) for the platform-admin layer and admin
// impersonation. Member auth is Clerk-based (no local session cookie).
app.use("/api", createSessionMiddleware());

// Per-request member auth context (member + org + role from Clerk session).
// Also resolves admin impersonation from the express-session when active.
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

  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

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

  // ── Monthly comparison report scheduler ──────────────────────────────────
  let lastRunYearMonth = "";
  const runIfFirstOfMonth = async () => {
    const now = new Date();
    if (now.getUTCDate() !== 1) return;
    const tag = `${now.getUTCFullYear()}-${now.getUTCMonth() + 1}`;
    if (tag === lastRunYearMonth) return;
    try {
      log("[monthly-report] running scheduled batch", "scheduler");
      const result = await runMonthlyReportsForAll();
      lastRunYearMonth = tag;
      log(`[monthly-report] generated=${result.generated} skipped=${result.skipped} failed=${result.failed}`, "scheduler");
    } catch (err) {
      console.error("[monthly-report] scheduled batch failed:", err);
    }
  };
  setTimeout(() => { runIfFirstOfMonth(); }, 30_000);
  setInterval(() => { runIfFirstOfMonth(); }, 6 * 60 * 60 * 1000);
})();
