CREATE UNIQUE INDEX IF NOT EXISTS "uniq_notifications_delivery_dedup_key"
  ON "notifications" ("user_id", "reference_id", "delivery_dedup_key")
  WHERE "delivery_dedup_key" IS NOT NULL AND "reference_id" IS NOT NULL;