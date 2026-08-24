#!/usr/bin/env node

/**
 * Verify that a published deployment exposes the application's health
 * contract instead of falling through to the SPA.
 *
 * Usage:
 *   node scripts/check-published-health.mjs https://example.replit.app
 *   PUBLISHED_URL=https://example.replit.app npm run check:published-health
 *   node scripts/check-published-health.mjs --compare .release-health/history.jsonl
 *   RELEASE_HEALTH_HISTORY_ARTIFACT=/path/to/retained/history.jsonl npm run release:restore-health-history
 *   RELEASE_HEALTH_HISTORY_ARTIFACT=/path/to/retained/history.jsonl npm run release:publish-health-history
 *
 * This intentionally sends no credentials. The health endpoints are public
 * and the check must be safe to run from a release pipeline.
 */

import { appendFile, copyFile, mkdir, open, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const args = process.argv.slice(2);
if (args.includes("--restore-history") || args.includes("--publish-history")) {
  const operation = args.includes("--restore-history") ? "restore" : "publish";
  process.exitCode = await retainHistory(operation);
  await new Promise((resolve) => setImmediate(resolve));
  process.exit();
}

const compareIndex = args.indexOf("--compare");
if (compareIndex !== -1) {
  const historyPath = args[compareIndex + 1]
    ?? process.env.RELEASE_HEALTH_HISTORY_ARTIFACT
    ?? process.env.RELEASE_HEALTH_HISTORY_FILE
    ?? ".release-health/history.jsonl";
  process.exitCode = await printComparison(historyPath, Number(process.env.RELEASE_HEALTH_COMPARE_LIMIT ?? 10));
  // Do not use process.exit here: allow stdout/stderr to flush.
  await new Promise((resolve) => setImmediate(resolve));
  process.exit();
}

const historyIndex = args.indexOf("--history-file");
const historyPath = historyIndex === -1
  ? process.env.RELEASE_HEALTH_HISTORY_FILE
  : args[historyIndex + 1];
if (historyIndex !== -1 && !historyPath) {
  console.error("--history-file requires a path.");
  process.exit(2);
}

const deploymentUrl = args.find((arg, index) =>
  !arg.startsWith("--") && !(historyIndex !== -1 && index === historyIndex + 1))
  ?? process.env.PUBLISHED_URL;
if (!deploymentUrl) {
  console.error(
    "Usage: node scripts/check-published-health.mjs <deployment-url>\n" +
      "Or set PUBLISHED_URL to the published deployment URL.\n" +
      "Add --history-file <path> (or RELEASE_HEALTH_HISTORY_FILE) to retain results.\n" +
      "Use --compare <path> to compare recent retained releases.",
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

const configuredTimeoutMs = Number(process.env.PUBLISHED_HEALTH_TIMEOUT_MS ?? 10_000);
const timeoutMs = Number.isFinite(configuredTimeoutMs) && configuredTimeoutMs > 0
  ? configuredTimeoutMs
  : 10_000;
let failed = false;
const results = [];

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
    results.push({ path: check.path, result: "PASS" });
    console.log(`RELEASE_HEALTH_CHECK endpoint=${check.path} result=PASS http_status=${response.status}`);
  } catch (error) {
    failed = true;
    const reason = error instanceof Error ? error.message : String(error);
    results.push({ path: check.path, result: "FAIL", reason });
    console.error(`RELEASE_HEALTH_CHECK_FAILURE endpoint=${check.path} reason=${reason}`);
    console.error(`FAIL ${check.path}: ${reason}`);
  }
}

console.log("RELEASE_HEALTH_SUMMARY");
for (const result of results) {
  if (result.result === "PASS") {
    console.log(`RELEASE_HEALTH_RESULT endpoint=${result.path} result=PASS`);
  } else {
    console.log(`RELEASE_HEALTH_RESULT endpoint=${result.path} result=FAIL reason=${result.reason}`);
  }
}

if (historyPath) {
  const record = {
    checkedAt: new Date().toISOString(),
    deployment: deploymentMetadata(),
    origin: baseUrl.origin,
    passed: !failed,
    endpoints: results,
  };
  try {
    await mkdir(dirname(historyPath), { recursive: true });
    await appendFile(historyPath, `${JSON.stringify(record)}\n`, "utf8");
    console.log(`RELEASE_HEALTH_HISTORY path=${historyPath} retained=true`);
  } catch (error) {
    console.error(
      `Unable to retain release health result in ${historyPath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    process.exit(1);
  }
}

if (failed) {
  console.error(`Published health contract failed for ${baseUrl.origin}.`);
  process.exit(1);
}

console.log(`Published health contract passed for ${baseUrl.origin}.`);

function deploymentMetadata() {
  const first = (...names) => names.map((name) => process.env[name]).find(Boolean) ?? null;
  return {
    id: first("RELEASE_DEPLOYMENT_ID", "DEPLOYMENT_ID", "REPL_DEPLOYMENT_ID"),
    version: first("RELEASE_VERSION", "DEPLOYMENT_VERSION", "RELEASE_TAG"),
    commit: first("RELEASE_COMMIT", "GIT_COMMIT", "CI_COMMIT_SHA"),
    environment: first("RELEASE_ENVIRONMENT", "DEPLOYMENT_ENVIRONMENT", "NODE_ENV"),
  };
}

async function printComparison(historyPath, requestedLimit) {
  let content;
  try {
    content = await readFile(historyPath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") {
      console.error(`No release health history found at ${historyPath}.`);
      return 1;
    }
    throw error;
  }

  const records = content.split(/\r?\n/).filter(Boolean).flatMap((line, lineNumber) => {
    try {
      const record = JSON.parse(line);
      return record?.checkedAt && Array.isArray(record.endpoints) ? [record] : [];
    } catch {
      console.error(`Ignoring malformed release health history line ${lineNumber + 1}.`);
      return [];
    }
  });
  const limit = Number.isInteger(requestedLimit) && requestedLimit > 0 ? requestedLimit : 10;
  const recent = records.slice(-limit).reverse();
  console.log(`RELEASE_HEALTH_COMPARISON releases=${recent.length} history=${historyPath}`);
  if (!recent.length) {
    console.log("No release health results recorded.");
    return 0;
  }
  console.log("checked_at | deployment | version | result | endpoint outcomes");
  for (const record of recent) {
    const deployment = record.deployment?.id ?? record.origin ?? "unknown";
    const version = record.deployment?.version ?? record.deployment?.commit ?? "unknown";
    const outcomes = record.endpoints
      .map((endpoint) => `${endpoint.path}=${endpoint.result}${endpoint.reason ? ` (${endpoint.reason})` : ""}`)
      .join("; ");
    console.log(`${record.checkedAt} | ${deployment} | ${version} | ${record.passed ? "PASS" : "FAIL"} | ${outcomes}`);
  }
  return 0;
}

async function retainHistory(operation) {
  const artifactPath = process.env.RELEASE_HEALTH_HISTORY_ARTIFACT;
  const historyFile = process.env.RELEASE_HEALTH_HISTORY_FILE ?? ".release-health/history.jsonl";

  if (!artifactPath) {
    console.log(
      `RELEASE_HEALTH_HISTORY_${operation.toUpperCase()} skipped=true ` +
        "reason=RELEASE_HEALTH_HISTORY_ARTIFACT is not configured",
    );
    return 0;
  }

  if (artifactPath === historyFile) {
    console.log(`RELEASE_HEALTH_HISTORY_${operation.toUpperCase()} path=${historyFile} retained=true`);
    return 0;
  }

  await mkdir(dirname(artifactPath), { recursive: true });
  let releaseLock;
  try {
    releaseLock = await acquireHistoryLock(artifactPath);
  } catch (error) {
    console.error(
      `Unable to ${operation} release health history: ${errorMessage(error)}`,
    );
    return 1;
  }

  try {
    if (operation === "restore") {
      try {
        await mkdir(dirname(historyFile), { recursive: true });
        await copyFile(artifactPath, historyFile);
        console.log(`RELEASE_HEALTH_HISTORY_RESTORE source=${artifactPath} path=${historyFile} retained=true`);
      } catch (error) {
        if (error?.code === "ENOENT") {
          console.log(`RELEASE_HEALTH_HISTORY_RESTORE source=${artifactPath} path=${historyFile} retained=false reason=not_found`);
          return 0;
        }
        console.error(`Unable to restore release health history from ${artifactPath}: ${errorMessage(error)}`);
        return 1;
      }
      return 0;
    }

    await new Promise((resolve) => setTimeout(resolve, Number(process.env.RELEASE_HEALTH_PUBLISH_DELAY_MS ?? 0)));
    const localContent = await readFile(historyFile, "utf8");
    let artifactContent = "";
    try {
      artifactContent = await readFile(artifactPath, "utf8");
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }

    // Each release restores a snapshot before it runs. Merge the snapshot
    // back into the artifact while locked instead of replacing newer records.
    const records = [...artifactContent.split(/\r?\n/), ...localContent.split(/\r?\n/)]
      .filter(Boolean);
    const mergedContent = `${[...new Set(records)].join("\n")}\n`;
    const temporaryPath = `${artifactPath}.tmp-${process.pid}`;
    try {
      await writeFile(temporaryPath, mergedContent, "utf8");
      await rename(temporaryPath, artifactPath);
    } finally {
      await rm(temporaryPath, { force: true });
    }
    console.log(`RELEASE_HEALTH_HISTORY_PUBLISH path=${artifactPath} retained=true`);
    return 0;
  } catch (error) {
    console.error(
      `Unable to ${operation} release health history${operation === "publish" ? ` to ${artifactPath}` : ` from ${artifactPath}`}: ${errorMessage(error)}`,
    );
    return 1;
  } finally {
    await releaseLock();
  }
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

async function acquireHistoryLock(artifactPath) {
  const lockPath = `${artifactPath}.lock`;
  const configuredTimeout = Number(process.env.RELEASE_HEALTH_LOCK_TIMEOUT_MS ?? 30_000);
  const timeoutMs = Number.isFinite(configuredTimeout) && configuredTimeout >= 0
    ? configuredTimeout
    : 30_000;
  const startedAt = Date.now();
  let handle;
  while (!handle) {
    try {
      handle = await open(lockPath, "wx");
      await handle.writeFile(`${process.pid}\n`);
    } catch (error) {
      if (error?.code !== "EEXIST") {
        throw new Error(`unable to create publication lock ${lockPath}: ${errorMessage(error)}`);
      }
      if (Date.now() - startedAt >= timeoutMs) {
        throw new Error(
          `publication lock conflict at ${lockPath}; another release may still be publishing (waited ${Date.now() - startedAt}ms)`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }
  return async () => {
    await handle.close();
    await rm(lockPath, { force: true });
  };
}
