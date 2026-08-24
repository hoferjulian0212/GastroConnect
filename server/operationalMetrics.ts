export const METRICS_WINDOW_MS = 5 * 60 * 1000;
export const METRICS_CACHE_TTL_MS = 10_000;
export const METRICS_QUERY_TIMEOUT_MS = 3_000;
export const TERMINAL_FAILURE_WINDOW_SECONDS = 24 * 60 * 60;
const API_SAMPLE_BUCKET_COUNT = METRICS_WINDOW_MS / 1_000;

type ApiRequestBucket = {
  second: number;
  requests: number;
  serverErrors: number;
};

type MetricsQueryResult = {
  rows: Array<Record<string, unknown>>;
};

export type MetricsPool = {
  connect: () => Promise<MetricsClient>;
  totalCount: number;
  idleCount: number;
  waitingCount: number;
  options?: { max?: number };
};

export type MetricsClient = {
  query: (query: unknown) => Promise<MetricsQueryResult>;
  release: (error?: Error) => void;
};

export type OperationalMetrics = {
  status: "ok";
  generatedAt: string;
  process: { uptimeSeconds: number };
  api: {
    windowSeconds: number;
    requests: number;
    serverErrors: number;
    serverErrorRate: number;
  };
  retryOutbox: {
    pending: number;
    terminalRecent: number;
    terminalWindowSeconds: number;
    oldestPendingAt: string | null;
  };
  database: {
    pool: {
      total: number;
      idle: number;
      waiting: number;
      max: number;
      exhausted: boolean;
    };
  };
};

type MetricsDependencies = {
  now?: () => number;
  uptimeSeconds?: () => number;
  poolMax?: number;
};

/**
 * Builds process-local operational metrics for a single app instance.
 *
 * The database work is cached briefly and coalesced so a monitor outage or
 * concurrent scrape cannot turn this endpoint into a source of pool pressure.
 * Query/schema failures intentionally reject: callers must return 503 rather
 * than publishing zero-valued "healthy" outbox data.
 */
export function createOperationalMetricsReader(
  pool: MetricsPool,
  dependencies: MetricsDependencies = {},
) {
  const now = dependencies.now ?? Date.now;
  const uptimeSeconds = dependencies.uptimeSeconds ?? process.uptime;
  const poolMax = dependencies.poolMax ?? pool.options?.max ?? 10;
  const apiRequestBuckets: ApiRequestBucket[] = Array.from(
    { length: API_SAMPLE_BUCKET_COUNT },
    () => ({ second: -1, requests: 0, serverErrors: 0 }),
  );
  let cached:
    | { expiresAt: number; value: OperationalMetrics }
    | undefined;
  let inFlight: Promise<OperationalMetrics> | undefined;

  const getApiSamples = (timestamp: number) => {
    const currentSecond = Math.floor(timestamp / 1_000);
    const firstIncludedSecond = currentSecond - API_SAMPLE_BUCKET_COUNT + 1;
    return apiRequestBuckets.reduce(
      (samples, bucket) => {
        if (bucket.second >= firstIncludedSecond && bucket.second <= currentSecond) {
          samples.requests += bucket.requests;
          samples.serverErrors += bucket.serverErrors;
        }
        return samples;
      },
      { requests: 0, serverErrors: 0 },
    );
  };

  const recordApiRequestSample = (serverError: boolean) => {
    const second = Math.floor(now() / 1_000);
    const bucket = apiRequestBuckets[second % API_SAMPLE_BUCKET_COUNT];
    if (bucket.second !== second) {
      bucket.second = second;
      bucket.requests = 0;
      bucket.serverErrors = 0;
    }
    bucket.requests += 1;
    if (serverError) bucket.serverErrors += 1;
  };

  const queryOutboxMetrics = async (): Promise<MetricsQueryResult> => {
    const client = await pool.connect();
    let discardClient = false;
    const query = (text: string, values?: unknown[]) => client.query({
      text,
      values,
      query_timeout: METRICS_QUERY_TIMEOUT_MS,
    });
    try {
      await query("BEGIN");
      // This is a server-side timeout, not only a client socket timeout.
      await query(`SET LOCAL statement_timeout = ${METRICS_QUERY_TIMEOUT_MS}`);
      const result = await query(`
        SELECT
          COUNT(*) FILTER (WHERE completed_at IS NULL AND failed_at IS NULL) AS pending,
          COUNT(*) FILTER (
            WHERE failed_at IS NOT NULL
              AND failed_at >= now() - ($1::int * interval '1 second')
          ) AS terminal_recent,
          MIN(created_at) FILTER (WHERE completed_at IS NULL AND failed_at IS NULL) AS oldest_pending_at
        FROM order_notification_retries
      `, [TERMINAL_FAILURE_WINDOW_SECONDS]);
      await query("COMMIT");
      return result;
    } catch (error) {
      // Do not return a timed-out or failed transaction connection to the pool.
      discardClient = true;
      try {
        await query("ROLLBACK");
      } catch {
        // The connection is discarded below.
      }
      throw error;
    } finally {
      client.release(discardClient ? new Error("operational metrics database query failed") : undefined);
    }
  };

  const buildMetrics = async (): Promise<OperationalMetrics> => {
    const timestamp = now();
    const result = await queryOutboxMetrics();
    const row = result.rows[0];
    const apiSamples = getApiSamples(timestamp);
    const oldestPendingAt = row?.oldest_pending_at instanceof Date
      ? row.oldest_pending_at.toISOString()
      : row?.oldest_pending_at ? String(row.oldest_pending_at) : null;

    return {
      status: "ok",
      generatedAt: new Date(timestamp).toISOString(),
      process: { uptimeSeconds: Math.round(uptimeSeconds()) },
      api: {
        windowSeconds: METRICS_WINDOW_MS / 1000,
        requests: apiSamples.requests,
        serverErrors: apiSamples.serverErrors,
        serverErrorRate: apiSamples.requests === 0
          ? 0
          : Number((apiSamples.serverErrors / apiSamples.requests).toFixed(4)),
      },
      retryOutbox: {
        pending: Number(row?.pending ?? 0),
        terminalRecent: Number(row?.terminal_recent ?? 0),
        terminalWindowSeconds: TERMINAL_FAILURE_WINDOW_SECONDS,
        oldestPendingAt,
      },
      database: {
        pool: {
          total: pool.totalCount,
          idle: pool.idleCount,
          waiting: pool.waitingCount,
          max: poolMax,
          exhausted: pool.waitingCount > 0 || (pool.totalCount >= poolMax && pool.idleCount === 0),
        },
      },
    };
  };

  const readOperationalMetrics = async (): Promise<OperationalMetrics> => {
    const timestamp = now();
    if (cached && cached.expiresAt > timestamp) {
      return cached.value;
    }
    if (inFlight) return inFlight;

    inFlight = buildMetrics()
      .then((value) => {
        cached = { value, expiresAt: now() + METRICS_CACHE_TTL_MS };
        return value;
      })
      .finally(() => {
        inFlight = undefined;
      });
    return inFlight;
  };

  return { recordApiRequestSample, readOperationalMetrics };
}