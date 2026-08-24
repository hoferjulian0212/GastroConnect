import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@shared/schema";

export const DATABASE_POOL_MAX = 10;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 3_000,
  max: DATABASE_POOL_MAX,
});

export const db = drizzle(pool, { schema });

const READINESS_QUERY_TIMEOUT_MS = 3_000;

/**
 * A health probe must not leave a stuck connection checked out. PostgreSQL's
 * statement timeout cancels the server-side query, and pool acquisition has a
 * bounded connection timeout when the network path is unhealthy. node-postgres
 * also supports query_timeout at runtime; the bundled typings predate that
 * option, so the narrow cast is kept at the adapter boundary.
 */
export async function checkDatabaseReadiness(): Promise<void> {
  const client = await pool.connect();
  let discardClient = false;
  const probeQuery = (text: string) => client.query({
    text,
    query_timeout: READINESS_QUERY_TIMEOUT_MS,
  } as any);
  try {
    await probeQuery("BEGIN");
    await probeQuery(`SET LOCAL statement_timeout = ${READINESS_QUERY_TIMEOUT_MS}`);
    await probeQuery("SELECT 1");
    await probeQuery("COMMIT");
  } catch (error) {
    // A timed-out probe may be backed by a stale socket. Never return that
    // connection to the pool, even when ROLLBACK happens to succeed.
    discardClient = true;
    try {
      await probeQuery("ROLLBACK");
    } catch {
      // The client is already marked for discard.
    }
    throw error;
  } finally {
    client.release(discardClient ? new Error("readiness probe database connection failed") : undefined);
  }
}
