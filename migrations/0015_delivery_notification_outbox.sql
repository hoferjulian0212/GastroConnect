CREATE TABLE IF NOT EXISTS "delivery_notification_retries" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "order_id" varchar(36) NOT NULL REFERENCES "orders"("id"),
  "restaurant_id" varchar(36) NOT NULL REFERENCES "users"("id"),
  "supplier_id" varchar(36) NOT NULL REFERENCES "users"("id"),
  "event_key" varchar(100) NOT NULL,
  "payload" jsonb NOT NULL,
  "attempts" integer NOT NULL DEFAULT 0,
  "next_attempt_at" timestamp NOT NULL DEFAULT now(),
  "lease_token" varchar(36),
  "last_error" text,
  "failed_at" timestamp,
  "completed_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_delivery_notification_retries_event"
  ON "delivery_notification_retries" ("order_id", "event_key");
CREATE INDEX IF NOT EXISTS "idx_delivery_notification_retries_pending"
  ON "delivery_notification_retries" ("completed_at", "next_attempt_at");