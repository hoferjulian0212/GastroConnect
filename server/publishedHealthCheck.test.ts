import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { once } from "node:events";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, test } from "node:test";
import { dirname, resolve } from "node:path";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const checkerPath = resolve(projectRoot, "scripts/check-published-health.mjs");

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
};

async function startFixtureServer(overrides: Record<string, Fixture>) {
  const server: Server = createServer((request: IncomingMessage, response: ServerResponse) => {
    const path = new URL(request.url ?? "/", "http://fixture").pathname;
    const override = overrides[path];
    const body = override?.body ?? JSON.stringify(validResponses[path]);
    response.statusCode = override?.status ?? 200;
    response.setHeader("content-type", override?.contentType ?? "application/json");
    response.end(body);
  });

  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert(address && typeof address !== "string");

  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolveClose, reject) => {
      server.close((error) => error ? reject(error) : resolveClose());
    }),
  };
}

async function runChecker(url: string) {
  const child = spawn(process.execPath, [checkerPath, url], {
    cwd: projectRoot,
    env: { ...process.env },
    stdio: ["ignore", "pipe", "pipe"],
  });

  const [stdout, stderr] = await Promise.all([
    streamText(child.stdout),
    streamText(child.stderr),
  ]);
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
      } finally {
        await server.close();
      }
    });
  }
});