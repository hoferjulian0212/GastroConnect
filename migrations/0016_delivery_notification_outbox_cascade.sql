DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'delivery_notification_retries_order_id_fkey'
      AND conrelid = 'delivery_notification_retries'::regclass
  ) THEN
    ALTER TABLE "delivery_notification_retries"
      DROP CONSTRAINT "delivery_notification_retries_order_id_fkey";
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'delivery_notification_retries_restaurant_id_fkey'
      AND conrelid = 'delivery_notification_retries'::regclass
  ) THEN
    ALTER TABLE "delivery_notification_retries"
      DROP CONSTRAINT "delivery_notification_retries_restaurant_id_fkey";
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'delivery_notification_retries_supplier_id_fkey'
      AND conrelid = 'delivery_notification_retries'::regclass
  ) THEN
    ALTER TABLE "delivery_notification_retries"
      DROP CONSTRAINT "delivery_notification_retries_supplier_id_fkey";
  END IF;
END $$;
ALTER TABLE "delivery_notification_retries"
  ADD CONSTRAINT "delivery_notification_retries_order_id_fkey"
    FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "delivery_notification_retries_restaurant_id_fkey"
    FOREIGN KEY ("restaurant_id") REFERENCES "users"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "delivery_notification_retries_supplier_id_fkey"
    FOREIGN KEY ("supplier_id") REFERENCES "users"("id") ON DELETE CASCADE;