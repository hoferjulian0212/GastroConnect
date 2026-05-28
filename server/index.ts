import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { runMonthlyReportsForAll } from "./monthlyReportService";
import { createServer } from "http";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

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

app.use(
  express.json({
    limit: "1mb",
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false, limit: "1mb" }));

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

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

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
    lastRunYearMonth = tag;
    try {
      log("[monthly-report] running scheduled batch", "scheduler");
      const result = await runMonthlyReportsForAll();
      log(`[monthly-report] generated=${result.generated} skipped=${result.skipped} failed=${result.failed}`, "scheduler");
    } catch (err) {
      console.error("[monthly-report] scheduled batch failed:", err);
    }
  };
  setTimeout(() => { runIfFirstOfMonth(); }, 30_000);
  setInterval(() => { runIfFirstOfMonth(); }, 6 * 60 * 60 * 1000);
})();
