import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { once } from "node:events";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, test } from "node:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const checkerPath = resolve(projectRoot, "scripts/check-published-health.mjs");
const packageJsonPath = resolve(projectRoot, "package.json");
const replitConfigPath = resolve(projectRoot, ".replit");

const validResponses: Record<string, unknown> = {
  "/health/live": { status: "ok" },
  "/health/ready": { status: "ok", dependencies: { database: "ok" } },
  "/health/metrics": {
    status: "ok",
    generatedAt: "2026-08-24T12:00:00.000Z",
    process: { uptimeSeconds: 12.5 },
    api: {
      windowSeconds: 60,
      requests: 10,
      serverErrors: 0,
      serverErrorRate: 0,
    },
    retryOutbox: { pending: 0, terminalRecent: 0 },
    database: { pool: { exhausted: false } },
  },
};

type Fixture = {
  status?: number;
  contentType?: string;
  body: string;
  hang?: boolean;
};

async function startFixtureServer(overrides: Record<string, Fixture>) {
  const sockets = new Set<import("node:net").Socket>();
  const server: Server = createServer((request: IncomingMessage, response: ServerResponse) => {
    const path = new URL(request.url ?? "/", "http://fixture").pathname;
    const override = overrides[path];
    if (override?.hang) return;

    const body = override?.body ?? JSON.stringify(validResponses[path]);
    response.statusCode = override?.status ?? 200;
    response.setHeader("content-type", override?.contentType ?? "application/json");
    response.end(body);
  });
  server.on("connection", (socket) => sockets.add(socket));
  server.on("close", () => sockets.clear());

  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert(address && typeof address !== "string");

  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolveClose, reject) => {
      for (const socket of sockets) socket.destroy();
      server.close((error) => error ? reject(error) : resolveClose());
    }),
  };
}

async function runChecker(url: string, timeoutMs?: number, historyFile?: string, extraEnv?: Record<string, string>) {
  const child = spawn(process.execPath, [checkerPath, url], {
    cwd: projectRoot,
    env: {
      ...process.env,
      ...(timeoutMs === undefined ? {} : { PUBLISHED_HEALTH_TIMEOUT_MS: String(timeoutMs) }),
      ...(historyFile === undefined ? {} : { RELEASE_HEALTH_HISTORY_FILE: historyFile }),
      ...extraEnv,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  const [stdout, stderr] = await Promise.all([
    streamText(child.stdout),
    streamText(child.stderr),
  ]);
  const [exitCode] = await once(child, "close");

  return { exitCode, stdout, stderr };
}

async function runHistoryCommand(command: "--restore-history" | "--publish-history", env: Record<string, string>) {
  const child = spawn(process.execPath, [checkerPath, command], {
    cwd: projectRoot,
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const [stdout, stderr] = await Promise.all([streamText(child.stdout), streamText(child.stderr)]);
  const [exitCode] = await once(child, "close");
  return { exitCode, stdout, stderr };
}

async function streamText(stream: NodeJS.ReadableStream | null) {
  if (!stream) return "";
  let text = "";
  for await (const chunk of stream) text += chunk;
  return text;
}

describe("published health contract checker", () => {
  const malformedResponses: Record<string, Fixture> = {
    "SPA HTML": {
      contentType: "text/html; charset=utf-8",
      body: "<!doctype html><html><body>SPA</body></html>",
    },
    "invalid JSON": {
      body: "{not valid json",
    },
    "missing metrics fields": {
      body: JSON.stringify({ status: "ok", generatedAt: "2026-08-24T12:00:00.000Z" }),
    },
    "non-2xx response": {
      status: 503,
      body: JSON.stringify({ status: "ok" }),
    },
  };

  for (const [name, fixture] of Object.entries(malformedResponses)) {
    test(`rejects ${name.toLowerCase()} and reports its endpoint`, async () => {
      const endpoint = name === "missing metrics fields" || name === "non-2xx response"
        ? "/health/metrics"
        : "/health/live";
      const server = await startFixtureServer({ [endpoint]: fixture });

      try {
        const result = await runChecker(server.url);
        assert.notEqual(result.exitCode, 0, result.stdout + result.stderr);
        assert.match(result.stderr, new RegExp(`FAIL ${endpoint.replace("/", "\\/")}:`));
        assert.match(
          result.stderr,
          new RegExp(`RELEASE_HEALTH_CHECK_FAILURE endpoint=${endpoint.replace("/", "\\/")} reason=`),
        );
      } finally {
        await server.close();
      }
    });
  }

  test("rejects a health endpoint that never responds and identifies it", async () => {
    const server = await startFixtureServer({
      "/health/live": { body: "", hang: true },
    });

    try {
      const result = await runChecker(server.url, 50);
      assert.notEqual(result.exitCode, 0, result.stdout + result.stderr);
      assert.match(result.stderr, /FAIL \/health\/live:/);
      assert.match(result.stderr, /timeout|abort/i);
    } finally {
      await server.close();
    }
  });

  test("prints a structured result for every passing endpoint", async () => {
    const server = await startFixtureServer({});

    try {
      const result = await runChecker(server.url);
      assert.equal(result.exitCode, 0, result.stdout + result.stderr);
      for (const endpoint of Object.keys(validResponses)) {
        assert.match(result.stdout, new RegExp(
          `RELEASE_HEALTH_RESULT endpoint=${endpoint.replace("/", "\\/")} result=PASS`,
        ));
      }
      assert.match(result.stdout, /RELEASE_HEALTH_SUMMARY/);
    } finally {
      await server.close();
    }
  });

  test("retains passing and failing endpoint outcomes with deployment metadata", async () => {
    const server = await startFixtureServer({
      "/health/ready": { status: 503, body: JSON.stringify({ status: "unavailable" }) },
    });
    const directory = await mkdtemp(resolve(projectRoot, "published-health-test-"));
    const historyFile = resolve(directory, "history.jsonl");

    try {
      const result = await runChecker(server.url, undefined, historyFile, {
        RELEASE_DEPLOYMENT_ID: "deployment-a",
        RELEASE_VERSION: "2026.08.24",
        RELEASE_COMMIT: "abc123",
      });
      assert.notEqual(result.exitCode, 0, result.stdout + result.stderr);
      const records = (await readFile(historyFile, "utf8")).trim().split("\n").map((line) => JSON.parse(line));
      assert.equal(records.length, 1);
      assert.equal(records[0].passed, false);
      assert.deepEqual(records[0].deployment, {
        id: "deployment-a",
        version: "2026.08.24",
        commit: "abc123",
        environment: null,
      });
      assert.deepEqual(records[0].endpoints.find((endpoint: { path: string }) => endpoint.path === "/health/live"), {
        path: "/health/live",
        result: "PASS",
      });
      assert.equal(records[0].endpoints.find((endpoint: { path: string }) => endpoint.path === "/health/ready").result, "FAIL");
      assert.match(records[0].endpoints.find((endpoint: { path: string }) => endpoint.path === "/health/ready").reason, /HTTP 503/);
    } finally {
      await server.close();
      await rm(directory, { recursive: true, force: true });
    }
  });

  test("compares recent retained releases and includes failure reasons", async () => {
    const directory = await mkdtemp(resolve(projectRoot, "published-health-test-"));
    const historyFile = resolve(directory, "history.jsonl");
    const records = [
      {
        checkedAt: "2026-08-23T12:00:00.000Z",
        deployment: { id: "old", version: "v1", commit: null, environment: null },
        origin: "https://old.example",
        passed: false,
        endpoints: [{ path: "/health/live", result: "FAIL", reason: "content-type text/html" }],
      },
      {
        checkedAt: "2026-08-24T12:00:00.000Z",
        deployment: { id: "new", version: "v2", commit: null, environment: null },
        origin: "https://new.example",
        passed: true,
        endpoints: [{ path: "/health/live", result: "PASS" }],
      },
    ];
    await writeFile(historyFile, records.map((record) => JSON.stringify(record)).join("\n") + "\n");
    try {
      const result = await new Promise<{ exitCode: number | null; stdout: string; stderr: string }>((resolveResult) => {
        const child = spawn(process.execPath, [checkerPath, "--compare", historyFile], {
          cwd: projectRoot,
          stdio: ["ignore", "pipe", "pipe"],
        });
        Promise.all([streamText(child.stdout), streamText(child.stderr)]).then(([stdout, stderr]) => {
          child.once("close", (exitCode) => resolveResult({ exitCode, stdout, stderr }));
        });
      });
      assert.equal(result.exitCode, 0, result.stdout + result.stderr);
      assert.match(result.stdout, /RELEASE_HEALTH_COMPARISON releases=2/);
      assert.match(result.stdout, /old \| v1 \| FAIL/);
      assert.match(result.stdout, /content-type text\/html/);
      assert.match(result.stdout, /new \| v2 \| PASS/);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  test("restores prior history and publishes the updated ledger", async () => {
    const directory = await mkdtemp(resolve(projectRoot, "published-health-test-"));
    const artifact = resolve(directory, "artifact", "history.jsonl");
    const historyFile = resolve(directory, "workspace", "history.jsonl");
    const priorRecord = {
      checkedAt: "2026-08-23T12:00:00.000Z",
      deployment: { id: "prior" },
      endpoints: [{ path: "/health/live", result: "PASS" }],
    };

    try {
      await mkdir(resolve(directory, "artifact"), { recursive: true });
      await writeFile(artifact, `${JSON.stringify(priorRecord)}\n`);
      const restore = await runHistoryCommand("--restore-history", {
        RELEASE_HEALTH_HISTORY_ARTIFACT: artifact,
        RELEASE_HEALTH_HISTORY_FILE: historyFile,
      });
      assert.equal(restore.exitCode, 0, restore.stdout + restore.stderr);
      assert.equal((await readFile(historyFile, "utf8")).trim(), JSON.stringify(priorRecord));

      await writeFile(historyFile, `${JSON.stringify(priorRecord)}\n${JSON.stringify({
        ...priorRecord,
        checkedAt: "2026-08-24T12:00:00.000Z",
        deployment: { id: "current" },
      })}\n`);
      const publish = await runHistoryCommand("--publish-history", {
        RELEASE_HEALTH_HISTORY_ARTIFACT: artifact,
        RELEASE_HEALTH_HISTORY_FILE: historyFile,
      });
      assert.equal(publish.exitCode, 0, publish.stdout + publish.stderr);
      assert.equal(await readFile(artifact, "utf8"), await readFile(historyFile, "utf8"));
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  test("preserves both records when publication attempts overlap", async () => {
    const directory = await mkdtemp(resolve(projectRoot, "published-health-test-"));
    const artifact = resolve(directory, "artifact", "history.jsonl");
    const workspaceOne = resolve(directory, "workspace-one", "history.jsonl");
    const workspaceTwo = resolve(directory, "workspace-two", "history.jsonl");
    const priorRecord = {
      checkedAt: "2026-08-23T12:00:00.000Z",
      deployment: { id: "prior" },
      endpoints: [{ path: "/health/live", result: "PASS" }],
    };
    const makeRecord = (id: string, checkedAt: string) => ({
      ...priorRecord,
      checkedAt,
      deployment: { id },
    });

    try {
      await mkdir(resolve(directory, "artifact"), { recursive: true });
      await mkdir(resolve(directory, "workspace-one"), { recursive: true });
      await mkdir(resolve(directory, "workspace-two"), { recursive: true });
      await writeFile(artifact, `${JSON.stringify(priorRecord)}\n`);
      await writeFile(workspaceOne, `${JSON.stringify(priorRecord)}\n${JSON.stringify(makeRecord("release-one", "2026-08-24T12:01:00.000Z"))}\n`);
      await writeFile(workspaceTwo, `${JSON.stringify(priorRecord)}\n${JSON.stringify(makeRecord("release-two", "2026-08-24T12:02:00.000Z"))}\n`);

      const [publishOne, publishTwo] = await Promise.all([
        runHistoryCommand("--publish-history", {
          RELEASE_HEALTH_HISTORY_ARTIFACT: artifact,
          RELEASE_HEALTH_HISTORY_FILE: workspaceOne,
          RELEASE_HEALTH_PUBLISH_DELAY_MS: "100",
        }),
        runHistoryCommand("--publish-history", {
          RELEASE_HEALTH_HISTORY_ARTIFACT: artifact,
          RELEASE_HEALTH_HISTORY_FILE: workspaceTwo,
          RELEASE_HEALTH_PUBLISH_DELAY_MS: "100",
        }),
      ]);
      assert.equal(publishOne.exitCode, 0, publishOne.stdout + publishOne.stderr);
      assert.equal(publishTwo.exitCode, 0, publishTwo.stdout + publishTwo.stderr);
      const records = (await readFile(artifact, "utf8")).trim().split("\n").map((line) => JSON.parse(line));
      assert.deepEqual(records.map((record) => record.deployment.id), ["prior", "release-one", "release-two"]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  test("rejects an unreachable deployment and identifies the affected endpoint", async () => {
    const server = await startFixtureServer({});
    const unreachableUrl = server.url;
    await server.close();

    const result = await runChecker(unreachableUrl);
    assert.notEqual(result.exitCode, 0, result.stdout + result.stderr);
    assert.match(result.stderr, /FAIL \/health\/live:/);
  });

  test("release build invokes the published health checker without credentials", () => {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
      scripts?: Record<string, string>;
    };
    const releaseBuild = packageJson.scripts?.["release:build"];
    assert.ok(
      releaseBuild,
      "Release wiring is missing: package.json must define a release:build script.",
    );
    assert.match(
      releaseBuild,
      /(?:^|&&\s*)npm run check:published-health(?:\s|$)/,
      "Release wiring is missing: release:build must invoke npm run check:published-health.",
    );

    const deploymentConfig = readFileSync(replitConfigPath, "utf8");
    const deploymentBuild = deploymentConfig.match(
      /^\s*build\s*=\s*\[([^\n]*)\]\s*$/m,
    )?.[1];
    assert.ok(
      deploymentBuild,
      "Release wiring is missing: .replit must define a deployment build command.",
    );
    assert.match(
      deploymentBuild,
      /["']npm["']\s*,\s*["']run["']\s*,\s*["']release:build["']/,
      "Release wiring is missing: the deployment build must invoke npm run release:build.",
    );

    const releaseWiring = `${releaseBuild}\n${deploymentBuild}`;
    assert.doesNotMatch(
      releaseWiring,
      /(?:--?(?:api[-_]?key|auth(?:orization)?|credential|password|secret|token)|\b(?:API_KEY|AUTHORIZATION|PASSWORD|SECRET|TOKEN)\s*=)/i,
      "Release wiring must not pass credentials to the published health checker.",
    );
  });
});