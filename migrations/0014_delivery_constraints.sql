ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "time_zone" varchar(64) NOT NULL DEFAULT 'Europe/Rome';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "restaurant_availability" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "restaurant_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "day_of_week" integer NOT NULL CHECK ("day_of_week" BETWEEN 0 AND 6),
  "opens_at" varchar(5) NOT NULL,
  "closes_at" varchar(5) NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_restaurant_availability_restaurant_day"
  ON "restaurant_availability" ("restaurant_id", "day_of_week");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "restaurant_availability_exceptions" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "restaurant_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "date" varchar(10) NOT NULL,
  "is_closed" boolean NOT NULL DEFAULT true,
  "opens_at" varchar(5),
  "closes_at" varchar(5),
  "note" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "uniq_restaurant_availability_exception_date" UNIQUE ("restaurant_id", "date")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "supplier_delivery_zones" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "supplier_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "postal_code_prefix" varchar(12) NOT NULL,
  "label" text,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "uniq_supplier_delivery_zone_prefix" UNIQUE ("supplier_id", "postal_code_prefix")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_supplier_delivery_zones_supplier"
  ON "supplier_delivery_zones" ("supplier_id", "is_active");