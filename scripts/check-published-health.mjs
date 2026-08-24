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

import { appendFile, copyFile, mkdir, open, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import { basename, dirname, join } from "node:path";

const HISTORY_LOCK_PROTOCOL = "release-health-flock-v1";
const HISTORY_LOCK_TOKEN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CLEANUP_FAILURE_EVENT = "RELEASE_HEALTH_RECOVERY_CLEANUP_FAILURE";
const args = process.argv.slice(2);
const lockedHistoryIndex = args.indexOf("--history-lock-held");
if (lockedHistoryIndex !== -1) {
  const operation = args[lockedHistoryIndex + 1];
  if (!["restore", "publish"].includes(operation)) {
    console.error("--history-lock-held requires restore or publish.");
    process.exit(2);
  }
  process.exitCode = await retainHistoryLocked(operation);
  await new Promise((resolve) => setImmediate(resolve));
  process.exit();
}

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
  const configuration = historyConfiguration(operation);
  if (!configuration) return 0;
  const { artifactPath } = configuration;
  await mkdir(dirname(artifactPath), { recursive: true });
  return runWithHistoryGate(operation, artifactPath);
}

async function retainHistoryLocked(operation) {
  const configuration = historyConfiguration(operation);
  if (!configuration) return 0;
  const { artifactPath, historyFile } = configuration;
  let releaseLock;
  try {
    releaseLock = await acquireHistoryMarker(artifactPath, operation);
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
    const temporaryPath = `${artifactPath}.tmp-${process.pid}-${randomUUID()}`;
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

function historyConfiguration(operation) {
  const artifactPath = process.env.RELEASE_HEALTH_HISTORY_ARTIFACT;
  const historyFile = process.env.RELEASE_HEALTH_HISTORY_FILE ?? ".release-health/history.jsonl";
  if (!artifactPath) {
    console.log(
      `RELEASE_HEALTH_HISTORY_${operation.toUpperCase()} skipped=true ` +
        "reason=RELEASE_HEALTH_HISTORY_ARTIFACT is not configured",
    );
    return null;
  }
  if (artifactPath === historyFile) {
    console.log(`RELEASE_HEALTH_HISTORY_${operation.toUpperCase()} path=${historyFile} retained=true`);
    return null;
  }
  return { artifactPath, historyFile };
}

async function runWithHistoryGate(operation, artifactPath) {
  const configuredTimeout = Number(process.env.RELEASE_HEALTH_LOCK_TIMEOUT_MS ?? 30_000);
  const timeoutMs = Number.isFinite(configuredTimeout) && configuredTimeout >= 0
    ? configuredTimeout
    : 30_000;
  const gatePath = `${artifactPath}.lock.guard`;
  const gate = spawn("/usr/bin/flock", [
    "-x",
    "-w",
    String(timeoutMs / 1_000),
    "-E",
    "75",
    gatePath,
    process.execPath,
    process.argv[1],
    "--history-lock-held",
    operation,
  ], { stdio: "inherit" });
  const exitCode = await new Promise((resolve, reject) => {
    gate.once("error", reject);
    gate.once("close", (code) => resolve(code ?? 1));
  });
  if (exitCode === 75) {
    console.error(
      `Unable to ${operation} release health history: publication lock conflict at ${artifactPath}.lock; ` +
        `another release may still be publishing (waited ${timeoutMs}ms)`,
    );
    return 1;
  }
  return exitCode;
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

async function acquireHistoryMarker(artifactPath, operation) {
  const lockPath = `${artifactPath}.lock`;
  const claimPath = `${lockPath}.claim`;
  const staleMs = historyLockStaleMs();
  let cleanupSummary;
  try {
    cleanupSummary = await cleanupStaleRecoveryRemnants(lockPath, staleMs);
  } catch (error) {
    // Keep the alert stable and free of paths, lock tokens, and filesystem
    // diagnostics. The surrounding command still fails closed with details.
    const alert = `${CLEANUP_FAILURE_EVENT} operation=${operation} reason=cleanup_incomplete`;
    console.error(alert);
    await writeCleanupFailureAlert(operation);
    throw error;
  }
  console.log(
    `RELEASE_HEALTH_RECOVERY_CLEANUP removed=${cleanupSummary.removed} retained=${cleanupSummary.retained}`,
  );
  let owner;
  let claimHeld = false;

  // mkdir is atomic on the shared filesystem. This claim must happen before
  // inspecting the marker; otherwise two remote publishers can both observe
  // an expired (or absent) marker and then overwrite one another.
  while (!claimHeld) {
    try {
      await mkdir(claimPath);
      claimHeld = true;
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      let claimOwner;
      try {
        claimOwner = parseHistoryMarker(await readFile(`${claimPath}/owner`, "utf8"));
      } catch (readError) {
        if (readError?.code !== "ENOENT") throw readError;
      }
      let claimLeaseUntil;
      if (claimOwner) {
        claimLeaseUntil = Date.parse(claimOwner.leaseUntil ?? claimOwner.startedAt);
      } else {
        // A process may be terminated after mkdir but before its owner marker
        // is written. The directory mtime is the only durable lease signal in
        // that window, so keep a recent empty claim protected.
        try {
          claimLeaseUntil = (await stat(claimPath)).mtimeMs + staleMs;
        } catch (statError) {
          if (statError?.code === "ENOENT") continue;
          throw statError;
        }
      }
      if (!Number.isFinite(claimLeaseUntil) || claimLeaseUntil > Date.now()) {
        throw new Error(
          `publication lock conflict at ${lockPath}; another publisher is claiming the lock`,
        );
      }
      // Rename is the atomic ownership handoff for stale claims. Recursive
      // removal followed by mkdir would let two reclaimers delete each
      // other's newly-created claim and both publish.
      const reclaimPath = `${claimPath}.reclaim-${randomUUID()}`;
      try {
        await rename(claimPath, reclaimPath);
      } catch (renameError) {
        if (renameError?.code === "ENOENT") continue;
        throw renameError;
      }
      await rm(reclaimPath, { recursive: true, force: true });
    }
  }

  const releaseClaim = async () => {
    try {
      const claimOwner = parseHistoryMarker(await readFile(`${claimPath}/owner`, "utf8"));
      if (claimOwner?.token === owner?.token) {
        await rm(claimPath, { recursive: true, force: true });
      }
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  };

  owner = {
    protocol: HISTORY_LOCK_PROTOCOL,
    token: randomUUID(),
    pid: process.pid,
    hostname: lockHostname(),
    startedAt: new Date().toISOString(),
    leaseUntil: new Date(Date.now() + staleMs).toISOString(),
  };
  try {
    await writeHistoryMarker(`${claimPath}/owner`, owner);
    try {
      const existing = parseHistoryMarker(await readFile(lockPath, "utf8"));
      if (!existing) {
        throw new Error(
          `publication lock conflict at ${lockPath}; existing lock ownership cannot be verified`,
        );
      }
      const leaseUntil = Date.parse(existing.leaseUntil ?? existing.startedAt);
      const leaseActive = Number.isFinite(leaseUntil) && leaseUntil > Date.now();
      const localOwner = existing.hostname === lockHostname();
      const processAlive = localOwner && isProcessAlive(existing.pid);
      if (leaseActive || processAlive) {
        throw new Error(
          `publication lock conflict at ${lockPath}; existing lock lease is active`,
        );
      }
      console.error(`RELEASE_HEALTH_LOCK_RECOVERED path=${lockPath} retained=false`);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    await writeHistoryMarker(lockPath, owner);
  } catch (error) {
    await releaseClaim();
    throw error;
  }

  const heartbeatMs = Math.max(25, Math.floor(staleMs / 3));
  const heartbeat = setInterval(async () => {
    try {
      const marker = parseHistoryMarker(await readFile(lockPath, "utf8"));
      if (marker?.token !== owner.token) return;
      owner.leaseUntil = new Date(Date.now() + staleMs).toISOString();
      await writeHistoryMarker(lockPath, owner);
      await writeHistoryMarker(`${claimPath}/owner`, owner);
    } catch {
      // Do not replace a lock we no longer own while renewing it.
    }
  }, heartbeatMs);
  heartbeat.unref?.();
  return async () => {
    clearInterval(heartbeat);
    try {
      const marker = parseHistoryMarker(await readFile(lockPath, "utf8"));
      if (marker?.token === owner.token) {
        await rm(lockPath);
      }
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    await releaseClaim();
  };
}

async function writeCleanupFailureAlert(operation) {
  const alertFile = process.env.RELEASE_HEALTH_ALERT_FILE;
  if (!alertFile) return;

  // The release pipeline can ship this JSONL file to the operator monitor.
  // Keep the payload deliberately limited to the stable public alert fields.
  try {
    await mkdir(dirname(alertFile), { recursive: true });
    await appendFile(
      alertFile,
      `${JSON.stringify({
        event: CLEANUP_FAILURE_EVENT,
        operation,
        reason: "cleanup_incomplete",
      })}\n`,
      "utf8",
    );
  } catch {
    // Alert delivery must never replace the original fail-closed cleanup
    // failure. The stderr event remains available to the release pipeline.
  }
}

async function cleanupStaleRecoveryRemnants(lockPath, staleMs) {
  if (process.env.NODE_ENV === "test" && process.env.RELEASE_HEALTH_TEST_FORCE_CLEANUP_FAILURE === "1") {
    throw new Error("forced cleanup failure");
  }
  const lockDirectory = dirname(lockPath);
  const reclaimPrefix = `${basename(lockPath)}.claim.reclaim-`;
  let removed = 0;
  let retained = 0;
  let entries;
  try {
    entries = await readdir(lockDirectory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return { removed, retained };
    throw error;
  }

  const staleBefore = Date.now() - staleMs;
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith(reclaimPrefix)) continue;
    const reclaimToken = entry.name.slice(reclaimPrefix.length);
    if (!HISTORY_LOCK_TOKEN.test(reclaimToken)) continue;

    const reclaimPath = join(lockDirectory, entry.name);
    let reclaimStats;
    try {
      reclaimStats = await stat(reclaimPath);
    } catch (error) {
      if (error?.code === "ENOENT") continue;
      throw error;
    }
    if (reclaimStats.mtimeMs > staleBefore) {
      retained++;
      continue;
    }

    try {
      await rm(reclaimPath, { recursive: true, force: true });
      removed++;
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  return { removed, retained };
}

function historyLockStaleMs() {
  const configured = Number(process.env.RELEASE_HEALTH_LOCK_STALE_MS ?? 30_000);
  return Number.isFinite(configured) && configured > 0 ? configured : 30_000;
}

function lockHostname() {
  return process.env.RELEASE_HEALTH_LOCK_HOSTNAME ?? hostname();
}

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

async function writeHistoryMarker(lockPath, marker) {
  const temporaryPath = `${lockPath}.tmp-${process.pid}-${randomUUID()}`;
  const handle = await open(temporaryPath, "wx");
  try {
    await handle.writeFile(`${JSON.stringify(marker)}\n`, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await rename(temporaryPath, lockPath);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

function parseHistoryMarker(contents) {
  try {
    const marker = JSON.parse(contents);
    if (
      !marker
      || typeof marker !== "object"
      || Array.isArray(marker)
      || marker.protocol !== HISTORY_LOCK_PROTOCOL
      || typeof marker.token !== "string"
      || !HISTORY_LOCK_TOKEN.test(marker.token)
      || !Number.isInteger(marker.pid)
      || marker.pid <= 0
      || typeof marker.hostname !== "string"
      || !marker.hostname
      || typeof marker.startedAt !== "string"
      || Number.isNaN(Date.parse(marker.startedAt))
    ) {
      return null;
    }
    return marker;
  } catch {
    return null;
  }
}
