import { Client } from "pg";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required to run checkout resilience migrations.");

const client = new Client({ connectionString: databaseUrl });

async function duplicateCount(query: string): Promise<number> {
  const result = await client.query(query);
  return Number(result.rows[0]?.count ?? 0);
}

async function main() {
  await client.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name text PRIMARY KEY,
        applied_at timestamp NOT NULL DEFAULT now()
      )
    `);
    const duplicateOrderCards = await duplicateCount(`
      SELECT COUNT(*)::int AS count FROM (
        SELECT order_id FROM messages
        WHERE message_type = 'order'
        GROUP BY order_id HAVING COUNT(*) > 1
      ) duplicates
    `);
    if (duplicateOrderCards) {
      throw new Error(
        `Checkout migration preflight failed: found ${duplicateOrderCards} duplicate order-card groups. ` +
        "Resolve these records explicitly before rerunning; this migration never deletes business history automatically."
      );
    }

    await client.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS idempotency_key varchar(128)`);
    await client.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS idempotency_fingerprint varchar(32)`);
    await client.query(`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS delivery_dedup_key varchar(32)`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS order_notification_retries (
        id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id varchar(36) NOT NULL REFERENCES orders(id),
        restaurant_id varchar(36) NOT NULL REFERENCES users(id),
        supplier_id varchar(36) NOT NULL REFERENCES users(id),
        payload jsonb NOT NULL,
        attempts integer NOT NULL DEFAULT 0,
        next_attempt_at timestamp NOT NULL DEFAULT now(),
        lease_token varchar(36),
        last_error text,
        failed_at timestamp,
        completed_at timestamp,
        created_at timestamp NOT NULL DEFAULT now()
      )
    `);
    await client.query(`ALTER TABLE order_notification_retries ADD COLUMN IF NOT EXISTS lease_token varchar(36)`);
    await client.query(`ALTER TABLE order_notification_retries ADD COLUMN IF NOT EXISTS failed_at timestamp`);

    // These statements must remain outside a transaction to avoid write blocking.
    await client.query(`DROP INDEX CONCURRENTLY IF EXISTS uniq_orders_restaurant_idempotency_key`);
    await client.query(`CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uniq_orders_restaurant_idempotency_supplier ON orders (restaurant_id, idempotency_key, supplier_id)`);
    await client.query(`CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uniq_order_card_per_order ON messages (order_id) WHERE message_type = 'order'`);
    await client.query(`CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uniq_checkout_new_order_notification ON notifications (user_id, reference_id) WHERE delivery_dedup_key = 'checkout_v1'`);
    await client.query(`CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uniq_order_notification_retries_order_supplier ON order_notification_retries (order_id, supplier_id)`);
    await client.query(`CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_order_notification_retries_pending ON order_notification_retries (completed_at, next_attempt_at)`);
    await client.query(`
      INSERT INTO schema_migrations (name)
      VALUES ('checkout-resilience-v1')
      ON CONFLICT (name) DO NOTHING
    `);

    console.log("Checkout resilience migration completed.");
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});