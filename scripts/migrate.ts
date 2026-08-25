import { readFile } from "node:fs/promises";
import path from "node:path";
import type { PoolClient } from "pg";
import { pool } from "../server/db";

type Queryable = {
  query: (text: string, values?: unknown[]) => Promise<{ rows: any[] }>;
};

type DuplicateGroup = {
  key: string;
  count: number;
};

const migrationFolder = path.resolve(process.cwd(), "migrations");
const preflightOnly = process.argv.includes("--preflight-only");
const verifyOnly = process.argv.includes("--verify-only");
const migrationLockTimeoutMs = parsePositiveTimeout(
  process.env.CHECKOUT_MIGRATION_LOCK_TIMEOUT_MS,
  5_000,
);
const migrationStatementTimeoutMs = parsePositiveTimeout(
  process.env.CHECKOUT_MIGRATION_STATEMENT_TIMEOUT_MS,
  120_000,
);
const checkoutMigrations = [
  {
    name: "0009_checkout_outbox",
    file: path.join(migrationFolder, "0009_checkout_outbox.sql"),
  },
  {
    name: "0010_checkout_fingerprint_dedup",
    file: path.join(migrationFolder, "0010_checkout_fingerprint_dedup.sql"),
  },
  {
    name: "0011_rescue_promotion_allocations",
    file: path.join(migrationFolder, "0011_rescue_promotion_allocations.sql"),
  },
  {
    name: "0012_product_sustainability_metadata",
    file: path.join(migrationFolder, "0012_product_sustainability_metadata.sql"),
  },
  {
    name: "0013_order_local_impact_snapshot",
    file: path.join(migrationFolder, "0013_order_local_impact_snapshot.sql"),
  },
] as const;

function parsePositiveTimeout(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 1_000 && parsed <= 15 * 60_000
    ? parsed
    : fallback;
}

async function relationExists(client: Queryable, relation: string): Promise<boolean> {
  const result = await client.query(
    "SELECT to_regclass($1) IS NOT NULL AS exists",
    [`public.${relation}`],
  );
  return result.rows[0]?.exists === true;
}

async function columnExists(client: Queryable, table: string, column: string): Promise<boolean> {
  const result = await client.query(
    `SELECT EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2
     ) AS exists`,
    [table, column],
  );
  return result.rows[0]?.exists === true;
}

async function duplicateGroups(client: Queryable, query: string): Promise<DuplicateGroup[]> {
  const result = await client.query(query);
  return result.rows.map((row) => ({
    key: String(row.key),
    count: Number(row.count),
  }));
}

function reportDuplicateGroups(label: string, groups: DuplicateGroup[]): void {
  if (groups.length === 0) return;
  const affectedRows = groups.reduce((total, group) => total + group.count, 0);
  console.error(
    `[checkout-migration] ${label}: ${groups.length} duplicate group(s), ${affectedRows} affected row(s).`,
  );
  for (const group of groups.slice(0, 20)) {
    console.error(`[checkout-migration]   ${group.key} (${group.count} rows)`);
  }
  if (groups.length > 20) {
    console.error(`[checkout-migration]   ...and ${groups.length - 20} more group(s)`);
  }
}

/**
 * Read-only rollout gate. It deliberately reports duplicates instead of
 * choosing a winner or deleting records: order cards and notifications are
 * business history and need an explicit owner decision before reconciliation.
 */
export async function runCheckoutPreflight(client: Queryable = pool): Promise<void> {
  const issues: Array<{ label: string; groups: DuplicateGroup[] }> = [];

  issues.push({
    label: "legacy order cards",
    groups: await duplicateGroups(client, `
      SELECT "order_id" AS key, COUNT(*)::int AS count
      FROM "messages"
      WHERE "message_type" = 'order' AND "order_id" IS NOT NULL
      GROUP BY "order_id"
      HAVING COUNT(*) > 1
      ORDER BY COUNT(*) DESC
    `),
  });

  issues.push({
    label: "legacy new-order notifications",
    groups: await duplicateGroups(client, `
      SELECT ("user_id" || ':' || "reference_id") AS key, COUNT(*)::int AS count
      FROM "notifications"
      WHERE "type" = 'new_order' AND "user_id" IS NOT NULL AND "reference_id" IS NOT NULL
      GROUP BY "user_id", "reference_id"
      HAVING COUNT(*) > 1
      ORDER BY COUNT(*) DESC
    `),
  });

  if (await columnExists(client, "orders", "idempotency_key")) {
    issues.push({
      label: "checkout idempotency keys",
      groups: await duplicateGroups(client, `
        SELECT ("restaurant_id" || ':' || "idempotency_key" || ':' || "supplier_id") AS key,
               COUNT(*)::int AS count
        FROM "orders"
        WHERE "idempotency_key" IS NOT NULL
        GROUP BY "restaurant_id", "idempotency_key", "supplier_id"
        HAVING COUNT(*) > 1
        ORDER BY COUNT(*) DESC
      `),
    });
  }

  if (await relationExists(client, "order_notification_retries")) {
    issues.push({
      label: "order notification outbox records",
      groups: await duplicateGroups(client, `
        SELECT ("order_id" || ':' || "supplier_id") AS key, COUNT(*)::int AS count
        FROM "order_notification_retries"
        GROUP BY "order_id", "supplier_id"
        HAVING COUNT(*) > 1
        ORDER BY COUNT(*) DESC
      `),
    });
  }

  const blockingIssues = issues.filter((issue) => issue.groups.length > 0);
  for (const issue of blockingIssues) {
    reportDuplicateGroups(issue.label, issue.groups);
  }
  if (blockingIssues.length > 0) {
    throw new Error(
      "Checkout migration preflight failed. Reconcile the reported records with an approved, non-destructive plan, then rerun the preflight.",
    );
  }
  console.log("[checkout-migration] preflight passed; no duplicate checkout artifacts found.");
}

type ExpectedIndex = {
  table: string;
  columns: string[];
  unique: boolean;
  predicate: string | null;
};

const expectedIndexes: Record<string, ExpectedIndex> = {
  uniq_orders_restaurant_idempotency_supplier: {
    table: "orders",
    columns: ["restaurant_id", "idempotency_key", "supplier_id"],
    unique: true,
    predicate: null,
  },
  uniq_order_card_per_order: {
    table: "messages",
    columns: ["order_id"],
    unique: true,
    predicate: "message_type = 'order'",
  },
  uniq_checkout_new_order_notification: {
    table: "notifications",
    columns: ["user_id", "reference_id"],
    unique: true,
    predicate: "delivery_dedup_key = 'checkout_v1'",
  },
  uniq_order_notification_retries_order_supplier: {
    table: "order_notification_retries",
    columns: ["order_id", "supplier_id"],
    unique: true,
    predicate: null,
  },
  idx_order_notification_retries_pending: {
    table: "order_notification_retries",
    columns: ["completed_at", "next_attempt_at"],
    unique: false,
    predicate: null,
  },
  uniq_promotions_source_risk: {
    table: "promotions",
    columns: ["source_risk_id"],
    unique: true,
    predicate: null,
  },
  idx_order_items_promotion_id: {
    table: "order_items",
    columns: ["promotion_id"],
    unique: false,
    predicate: null,
  },
  uniq_promotion_allocations_order_item: {
    table: "promotion_allocations",
    columns: ["order_item_id"],
    unique: true,
    predicate: null,
  },
  idx_promotion_allocations_promotion: {
    table: "promotion_allocations",
    columns: ["promotion_id"],
    unique: false,
    predicate: null,
  },
};

function normalizePredicate(predicate: string | null): string | null {
  if (predicate === null) return null;
  return predicate
    .toLowerCase()
    .replace(/::"?[a-z0-9_.]+"?/g, "")
    .replace(/[\s()"']/g, "");
}

export async function verifyCheckoutMigration(client: Queryable = pool): Promise<void> {
  const missingColumns = [];
  for (const column of ["idempotency_key", "idempotency_fingerprint"]) {
    if (!(await columnExists(client, "orders", column))) {
      missingColumns.push(`orders.${column}`);
    }
  }
  if (!(await columnExists(client, "notifications", "delivery_dedup_key"))) {
    missingColumns.push("notifications.delivery_dedup_key");
  }
  for (const column of ["lease_token", "failed_at"]) {
    if (!(await columnExists(client, "order_notification_retries", column))) {
      missingColumns.push(`order_notification_retries.${column}`);
    }
  }
  if (!(await relationExists(client, "order_notification_retries"))) {
    missingColumns.push("order_notification_retries");
  }
  for (const column of [
    "promotion_type", "source_risk_id", "quantity_cap", "rescue_quality",
    "rescue_reserved_quantity", "rescue_sold_quantity",
  ]) {
    if (!(await columnExists(client, "promotions", column))) missingColumns.push(`promotions.${column}`);
  }
  if (!(await columnExists(client, "order_items", "promotion_id"))) {
    missingColumns.push("order_items.promotion_id");
  }
  if (!(await relationExists(client, "promotion_allocations"))) {
    missingColumns.push("promotion_allocations");
  }
  for (const column of [
    "origin_country_code", "origin_region", "origin_locality", "origin_postal_code",
    "season_months", "packaging_type", "sustainability_source",
    "sustainability_evidence_url", "sustainability_evidence_note",
    "sustainability_verified_at", "sustainability_updated_at",
  ]) {
    if (!(await columnExists(client, "products", column))) missingColumns.push(`products.${column}`);
  }
  if (!(await columnExists(client, "order_items", "local_impact_snapshot"))) {
    missingColumns.push("order_items.local_impact_snapshot");
  }

  const expectedProductConstraints = [
    "chk_products_origin_country_code",
    "chk_products_season_months",
    "chk_products_packaging_type",
    "chk_products_sustainability_source",
  ];
  const constraintResult = await client.query(
    `SELECT constraint_name
       FROM information_schema.table_constraints
      WHERE table_schema = 'public'
        AND table_name = 'products'
        AND constraint_name = ANY($1::text[])`,
    [expectedProductConstraints],
  );
  const presentConstraints = new Set(constraintResult.rows.map((row) => String(row.constraint_name)));
  for (const constraint of expectedProductConstraints) {
    if (!presentConstraints.has(constraint)) missingColumns.push(`products.${constraint}`);
  }

  const indexNames = Object.keys(expectedIndexes);
  const result = await client.query(
    `SELECT
       index_relation.relname AS indexname,
       table_relation.relname AS tablename,
       indexes.indisunique,
       ARRAY(
         SELECT pg_get_indexdef(indexes.indexrelid, column_position, true)
         FROM generate_series(1, indexes.indnkeyatts) AS column_position
         ORDER BY column_position
       ) AS columns,
       pg_get_expr(indexes.indpred, indexes.indrelid, true) AS predicate
     FROM pg_index indexes
     JOIN pg_class index_relation ON index_relation.oid = indexes.indexrelid
     JOIN pg_class table_relation ON table_relation.oid = indexes.indrelid
     JOIN pg_namespace namespace ON namespace.oid = table_relation.relnamespace
     WHERE namespace.nspname = 'public' AND index_relation.relname = ANY($1::text[])`,
    [indexNames],
  );
  const catalog = new Map(result.rows.map((row) => [String(row.indexname), row]));
  const invalidIndexes: string[] = [];
  for (const [name, expected] of Object.entries(expectedIndexes)) {
    const actual = catalog.get(name);
    const actualColumns: string[] = Array.isArray(actual?.columns)
      ? actual.columns.map((column: unknown) => String(column))
      : [];
    const matches = actual
      && String(actual.tablename) === expected.table
      && Boolean(actual.indisunique) === expected.unique
      && actualColumns.length === expected.columns.length
      && actualColumns.every((column, index) => column === expected.columns[index])
      && normalizePredicate(actual.predicate === null ? null : String(actual.predicate))
        === normalizePredicate(expected.predicate);
    if (!matches) {
      invalidIndexes.push(name);
    }
  }

  if (missingColumns.length > 0 || invalidIndexes.length > 0) {
    if (missingColumns.length > 0) {
      console.error(`[checkout-migration] missing schema objects: ${missingColumns.join(", ")}`);
    }
    if (invalidIndexes.length > 0) {
      console.error(`[checkout-migration] missing or invalid indexes: ${invalidIndexes.join(", ")}`);
    }
    throw new Error("Checkout migration verification failed.");
  }
  console.log("[checkout-migration] verification passed; checkout schema and indexes are present.");
}

async function applyCheckoutMigrations(client: PoolClient): Promise<void> {
  // Historical environments were created with db:push and boot-time DDL, so
  // they do not have a reliable Drizzle baseline. Keep this deployment ledger
  // independent rather than attempting to replay every legacy migration.
  await client.query("SELECT set_config('lock_timeout', $1, false)", [`${migrationLockTimeoutMs}ms`]);
  await client.query("SELECT set_config('statement_timeout', $1, false)", [`${migrationStatementTimeoutMs}ms`]);
  console.log(
    `[checkout-migration] lock timeout ${migrationLockTimeoutMs}ms; statement timeout ${migrationStatementTimeoutMs}ms.`,
  );
  await client.query(`
    CREATE TABLE IF NOT EXISTS "deployment_migrations" (
      "name" text PRIMARY KEY,
      "applied_at" timestamp NOT NULL DEFAULT now()
    )
  `);

  await client.query("SELECT pg_advisory_lock(hashtext($1))", ["checkout-schema-migrations"]);
  try {
    for (const migration of checkoutMigrations) {
      const applied = await client.query(
        `SELECT 1 FROM "deployment_migrations" WHERE "name" = $1`,
        [migration.name],
      );
      if (applied.rows.length > 0) {
        console.log(`[checkout-migration] ${migration.name} already applied.`);
        continue;
      }

      const statements = (await readFile(migration.file, "utf8"))
        .split("--> statement-breakpoint")
        .map((statement) => statement.trim())
        .filter(Boolean);

      console.log(`[checkout-migration] applying ${migration.name}...`);
      await client.query("BEGIN");
      try {
        for (const statement of statements) {
          await client.query(statement);
        }
        // Verify the PostgreSQL catalog before recording this migration. This
        // prevents a same-named, stale or non-unique index from being certified
        // when CREATE INDEX IF NOT EXISTS skips it.
        // The verifier describes the newest schema. Older versions must not be
        // judged against columns introduced by a later migration in this run.
        if (migration === checkoutMigrations[checkoutMigrations.length - 1]) {
          await verifyCheckoutMigration(client);
        }
        await client.query(
          `INSERT INTO "deployment_migrations" ("name") VALUES ($1)`,
          [migration.name],
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      }
    }
  } finally {
    await client.query("SELECT pg_advisory_unlock(hashtext($1))", ["checkout-schema-migrations"])
      .catch(() => undefined);
  }
}

async function main(): Promise<void> {
  try {
    if (!verifyOnly) {
      await runCheckoutPreflight();
    }
    if (preflightOnly || verifyOnly) {
      if (verifyOnly) await verifyCheckoutMigration();
      return;
    }

    const client = await pool.connect();
    try {
      await applyCheckoutMigrations(client);
    } finally {
      client.release();
    }
    await verifyCheckoutMigration();
    console.log("[checkout-migration] migration complete.");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("[checkout-migration] failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});