-- Compatibility bridge for databases that recorded 0009 before the checkout
-- request-fingerprint and delivery-dedup fields were consolidated here.
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "idempotency_fingerprint" varchar(32);--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "delivery_dedup_key" varchar(32);--> statement-breakpoint
DROP INDEX IF EXISTS "uniq_new_order_notification_per_order";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_checkout_new_order_notification"
  ON "notifications" ("user_id", "reference_id") WHERE "delivery_dedup_key" = 'checkout_v1';