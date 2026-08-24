-- Checkout schema is deployed separately from application boot. The
-- scripts/migrate.ts preflight reports legacy duplicate business records before
-- this migration is run; this in-transaction guard also protects direct
-- invocation of the reviewed migration SQL.

ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "idempotency_key" varchar(128);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "idempotency_fingerprint" varchar(32);--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "delivery_dedup_key" varchar(32);--> statement-breakpoint
DROP INDEX IF EXISTS "uniq_orders_restaurant_idempotency_key";--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "order_notification_retries" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "order_id" varchar(36) NOT NULL REFERENCES "orders"("id"),
  "restaurant_id" varchar(36) NOT NULL REFERENCES "users"("id"),
  "supplier_id" varchar(36) NOT NULL REFERENCES "users"("id"),
  "payload" jsonb NOT NULL,
  "attempts" integer NOT NULL DEFAULT 0,
  "next_attempt_at" timestamp NOT NULL DEFAULT now(),
  "lease_token" varchar(36),
  "last_error" text,
  "failed_at" timestamp,
  "completed_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now()
);--> statement-breakpoint
ALTER TABLE "order_notification_retries" ADD COLUMN IF NOT EXISTS "lease_token" varchar(36);--> statement-breakpoint
ALTER TABLE "order_notification_retries" ADD COLUMN IF NOT EXISTS "failed_at" timestamp;--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "messages"
    WHERE "message_type" = 'order' AND "order_id" IS NOT NULL
    GROUP BY "order_id"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'checkout migration blocked: duplicate order cards exist; reconcile them without deleting business records';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "notifications"
    WHERE "type" = 'new_order' AND "user_id" IS NOT NULL AND "reference_id" IS NOT NULL
    GROUP BY "user_id", "reference_id"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'checkout migration blocked: duplicate new-order notifications exist; reconcile them without deleting business records';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "orders"
    WHERE "idempotency_key" IS NOT NULL
    GROUP BY "restaurant_id", "idempotency_key", "supplier_id"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'checkout migration blocked: duplicate checkout idempotency keys exist; reconcile them before rollout';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "order_notification_retries"
    GROUP BY "order_id", "supplier_id"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'checkout migration blocked: duplicate order notification outbox records exist; reconcile them before rollout';
  END IF;
END $$;--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "uniq_orders_restaurant_idempotency_supplier"
  ON "orders" ("restaurant_id", "idempotency_key", "supplier_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_order_card_per_order"
  ON "messages" ("order_id") WHERE "message_type" = 'order';--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_checkout_new_order_notification"
  ON "notifications" ("user_id", "reference_id") WHERE "delivery_dedup_key" = 'checkout_v1';--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_order_notification_retries_order_supplier"
  ON "order_notification_retries" ("order_id", "supplier_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_order_notification_retries_pending"
  ON "order_notification_retries" ("completed_at", "next_attempt_at");