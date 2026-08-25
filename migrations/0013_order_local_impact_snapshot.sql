ALTER TABLE "order_items"
  ADD COLUMN IF NOT EXISTS "local_impact_snapshot" jsonb;