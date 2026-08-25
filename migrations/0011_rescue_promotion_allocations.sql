ALTER TABLE "promotions" ADD COLUMN IF NOT EXISTS "promotion_type" varchar(16) NOT NULL DEFAULT 'generic';--> statement-breakpoint
ALTER TABLE "promotions" ADD COLUMN IF NOT EXISTS "source_risk_id" varchar(36);--> statement-breakpoint
ALTER TABLE "promotions" ADD COLUMN IF NOT EXISTS "quantity_cap" integer;--> statement-breakpoint
ALTER TABLE "promotions" ADD COLUMN IF NOT EXISTS "rescue_quality" text;--> statement-breakpoint
ALTER TABLE "promotions" ADD COLUMN IF NOT EXISTS "rescue_reserved_quantity" integer NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE "promotions" ADD COLUMN IF NOT EXISTS "rescue_sold_quantity" integer NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "promotion_id" varchar(36);--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "promotions" ADD CONSTRAINT "fk_promotions_source_risk"
    FOREIGN KEY ("source_risk_id") REFERENCES "inventory_risk_records"("id") NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "order_items" ADD CONSTRAINT "fk_order_items_promotion"
    FOREIGN KEY ("promotion_id") REFERENCES "promotions"("id") ON DELETE SET NULL NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "promotions" ADD CONSTRAINT "chk_promotions_rescue_shape" CHECK (
    ("promotion_type" = 'generic' AND "source_risk_id" IS NULL AND "quantity_cap" IS NULL AND "rescue_quality" IS NULL)
    OR
    ("promotion_type" = 'rescue' AND "source_risk_id" IS NOT NULL AND "quantity_cap" > 0 AND "rescue_quality" IS NOT NULL)
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "promotions" ADD CONSTRAINT "chk_promotions_rescue_counters" CHECK (
    "rescue_reserved_quantity" >= 0 AND "rescue_sold_quantity" >= 0
    AND ("quantity_cap" IS NULL OR "rescue_reserved_quantity" + "rescue_sold_quantity" <= "quantity_cap")
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_promotions_source_risk" ON "promotions" ("source_risk_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_order_items_promotion_id" ON "order_items" ("promotion_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "promotion_allocations" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "promotion_id" varchar(36) NOT NULL REFERENCES "promotions"("id"),
  "order_item_id" varchar(36) NOT NULL REFERENCES "order_items"("id"),
  "reserved_quantity" integer NOT NULL DEFAULT 0,
  "sold_quantity" integer NOT NULL DEFAULT 0,
  "released_quantity" integer NOT NULL DEFAULT 0,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "chk_promotion_allocations_quantities" CHECK (
    "reserved_quantity" >= 0 AND "sold_quantity" >= 0 AND "released_quantity" >= 0
  )
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_promotion_allocations_order_item" ON "promotion_allocations" ("order_item_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_promotion_allocations_promotion" ON "promotion_allocations" ("promotion_id");--> statement-breakpoint
CREATE OR REPLACE FUNCTION prevent_rescue_source_mutation() RETURNS trigger AS $$
BEGIN
  IF OLD.promotion_type = 'rescue' AND (
    NEW.promotion_type IS DISTINCT FROM OLD.promotion_type OR
    NEW.source_risk_id IS DISTINCT FROM OLD.source_risk_id OR
    NEW.quantity_cap IS DISTINCT FROM OLD.quantity_cap OR
    NEW.rescue_quality IS DISTINCT FROM OLD.rescue_quality OR
    NEW.product_id IS DISTINCT FROM OLD.product_id OR
    NEW.supplier_id IS DISTINCT FROM OLD.supplier_id
  ) THEN
    RAISE EXCEPTION 'Rescue promotion source metadata is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
DROP TRIGGER IF EXISTS "trg_prevent_rescue_source_mutation" ON "promotions";--> statement-breakpoint
CREATE TRIGGER "trg_prevent_rescue_source_mutation" BEFORE UPDATE ON "promotions"
FOR EACH ROW EXECUTE FUNCTION prevent_rescue_source_mutation();