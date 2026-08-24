#!/usr/bin/env node

/**
 * Verify that a published deployment exposes the application's health
 * contract instead of falling through to the SPA.
 *
 * Usage:
 *   node scripts/check-published-health.mjs https://example.replit.app
 *   PUBLISHED_URL=https://example.replit.app npm run check:published-health
 *
 * This intentionally sends no credentials. The health endpoints are public
 * and the check must be safe to run from a release pipeline.
 */

const deploymentUrl = process.argv[2] ?? process.env.PUBLISHED_URL;
if (!deploymentUrl) {
  console.error(
    "Usage: node scripts/check-published-health.mjs <deployment-url>\n" +
      "Or set PUBLISHED_URL to the published deployment URL.",
  );
  process.exit(2);
}

let baseUrl;
try {
  baseUrl = new URL(deploymentUrl);
  if (!["http:", "https:"].includes(baseUrl.protocol)) {
    throw new Error("URL must use http or https");
  }
} catch (error) {
  console.error(`Invalid deployment URL: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(2);
}

baseUrl.pathname = baseUrl.pathname.replace(/\/+$/, "");
baseUrl.search = "";
baseUrl.hash = "";

const checks = [
  {
    path: "/health/live",
    validate(body) {
      return body?.status === "ok" ? null : 'expected {"status":"ok"}';
    },
  },
  {
    path: "/health/ready",
    validate(body) {
      return body?.status === "ok" && body?.dependencies?.database === "ok"
        ? null
        : 'expected status "ok" and dependencies.database "ok"';
    },
  },
  {
    path: "/health/metrics",
    validate(body) {
      const required = [
        ["status", body?.status === "ok"],
        ["generatedAt", typeof body?.generatedAt === "string"],
        ["process.uptimeSeconds", typeof body?.process?.uptimeSeconds === "number"],
        ["api.windowSeconds", typeof body?.api?.windowSeconds === "number"],
        ["api.requests", typeof body?.api?.requests === "number"],
        ["api.serverErrors", typeof body?.api?.serverErrors === "number"],
        ["api.serverErrorRate", typeof body?.api?.serverErrorRate === "number"],
        ["retryOutbox.pending", typeof body?.retryOutbox?.pending === "number"],
        ["retryOutbox.terminalRecent", typeof body?.retryOutbox?.terminalRecent === "number"],
        ["database.pool.exhausted", typeof body?.database?.pool?.exhausted === "boolean"],
      ];
      const missing = required.filter(([, present]) => !present).map(([name]) => name);
      return missing.length ? `missing or invalid fields: ${missing.join(", ")}` : null;
    },
  },
];

const timeoutMs = 10_000;
let failed = false;

for (const check of checks) {
  const url = new URL(check.path, baseUrl);
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      redirect: "manual",
    });
    const contentType = response.headers.get("content-type") ?? "";
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} (expected 2xx)`);
    }
    if (!/^application\/json(?:\s*;|$)/i.test(contentType)) {
      throw new Error(`content-type ${JSON.stringify(contentType)} (expected application/json)`);
    }

    let body;
    try {
      body = await response.json();
    } catch {
      throw new Error("response body is not valid JSON");
    }
    const contractError = check.validate(body);
    if (contractError) throw new Error(contractError);
    console.log(`PASS ${check.path} (HTTP ${response.status}, ${contentType})`);
  } catch (error) {
    failed = true;
    console.error(`FAIL ${check.path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

if (failed) {
  console.error(`Published health contract failed for ${baseUrl.origin}.`);
  process.exit(1);
}

console.log(`Published health contract passed for ${baseUrl.origin}.`);