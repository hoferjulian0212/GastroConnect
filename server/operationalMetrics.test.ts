import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  createOperationalMetricsReader,
  METRICS_CACHE_TTL_MS,
  METRICS_QUERY_TIMEOUT_MS,
  TERMINAL_FAILURE_WINDOW_SECONDS,
  type MetricsPool,
} from "./operationalMetrics";

function createPool(
  query: (query: any) => ReturnType<import("./operationalMetrics").MetricsClient["query"]>,
  counts: Partial<Pick<MetricsPool, "totalCount" | "idleCount" | "waitingCount">> = {},
): MetricsPool {
  return {
    connect: async () => ({
      query,
      release: () => {},
    }),
    totalCount: counts.totalCount ?? 1,
    idleCount: counts.idleCount ?? 1,
    waitingCount: counts.waitingCount ?? 0,
  };
}

describe("operational metrics", () => {
  test("reports recent terminal failures and bounds the database query", async () => {
    let currentTime = 1_700_000_000_000;
    const receivedQueries: any[] = [];
    const metrics = createOperationalMetricsReader(
      createPool(async (query) => {
        receivedQueries.push(query);
        if (!String(query.text).includes("FROM order_notification_retries")) {
          return { rows: [] };
        }
        return {
          rows: [{
            pending: "2",
            terminal_recent: "1",
            oldest_pending_at: new Date("2026-08-24T10:00:00.000Z"),
          }],
        };
      }),
      { now: () => currentTime, uptimeSeconds: () => 12.6, poolMax: 10 },
    );

    metrics.recordApiRequestSample(false);
    metrics.recordApiRequestSample(true);
    const result = await metrics.readOperationalMetrics();

    assert.equal(result.status, "ok");
    assert.equal(result.api.requests, 2);
    assert.equal(result.api.serverErrors, 1);
    assert.equal(result.api.serverErrorRate, 0.5);
    assert.deepEqual(result.retryOutbox, {
      pending: 2,
      terminalRecent: 1,
      terminalWindowSeconds: TERMINAL_FAILURE_WINDOW_SECONDS,
      oldestPendingAt: "2026-08-24T10:00:00.000Z",
    });
    const outboxQuery = receivedQueries.find((query) =>
      String(query.text).includes("FROM order_notification_retries"),
    );
    assert.equal(outboxQuery.values[0], TERMINAL_FAILURE_WINDOW_SECONDS);
    assert.equal(outboxQuery.query_timeout, METRICS_QUERY_TIMEOUT_MS);
    assert.match(outboxQuery.text, /FROM order_notification_retries/);
    assert.ok(receivedQueries.some((query) =>
      String(query.text).includes(`SET LOCAL statement_timeout = ${METRICS_QUERY_TIMEOUT_MS}`),
    ));

    currentTime += METRICS_CACHE_TTL_MS - 1;
    await metrics.readOperationalMetrics();
    assert.ok(outboxQuery);
  });

  test("coalesces concurrent reads and fails closed when the outbox query fails", async () => {
    let calls = 0;
    let resolveQuery: (() => void) | undefined;
    const queryWait = new Promise<void>((resolve) => { resolveQuery = resolve; });
    const metrics = createOperationalMetricsReader(createPool(async (query) => {
      if (!String(query.text).includes("FROM order_notification_retries")) {
        return { rows: [] };
      }
      calls += 1;
      await queryWait;
      return { rows: [{ pending: "0", terminal_recent: "0", oldest_pending_at: null }] };
    }));

    const first = metrics.readOperationalMetrics();
    const second = metrics.readOperationalMetrics();
    resolveQuery?.();
    await Promise.all([first, second]);
    assert.equal(calls, 1);

    const unavailable = createOperationalMetricsReader(createPool(async (query) => {
      if (!String(query.text).includes("FROM order_notification_retries")) {
        return { rows: [] };
      }
      const error = new Error("relation does not exist");
      (error as Error & { code?: string }).code = "42P01";
      throw error;
    }));
    await assert.rejects(unavailable.readOperationalMetrics(), /relation does not exist/);
  });

  test("expires old API samples and exposes pool exhaustion", async () => {
    let currentTime = 1_700_000_000_000;
    const metrics = createOperationalMetricsReader(
      createPool(
        async (query) => String(query.text).includes("FROM order_notification_retries")
          ? { rows: [{ pending: "0", terminal_recent: "0", oldest_pending_at: null }] }
          : { rows: [] },
        { totalCount: 10, idleCount: 0, waitingCount: 1 },
      ),
      { now: () => currentTime, poolMax: 10 },
    );

    metrics.recordApiRequestSample(true);
    currentTime += 5 * 60 * 1000 + 1;
    const result = await metrics.readOperationalMetrics();
    assert.equal(result.api.requests, 0);
    assert.equal(result.database.pool.exhausted, true);
  });
});