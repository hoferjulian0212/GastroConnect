ALTER TABLE "products"
  ADD COLUMN IF NOT EXISTS "origin_country_code" varchar(2),
  ADD COLUMN IF NOT EXISTS "origin_region" text,
  ADD COLUMN IF NOT EXISTS "origin_locality" text,
  ADD COLUMN IF NOT EXISTS "origin_postal_code" varchar(20),
  ADD COLUMN IF NOT EXISTS "season_months" integer[],
  ADD COLUMN IF NOT EXISTS "packaging_type" varchar(20),
  ADD COLUMN IF NOT EXISTS "sustainability_source" varchar(16),
  ADD COLUMN IF NOT EXISTS "sustainability_evidence_url" text,
  ADD COLUMN IF NOT EXISTS "sustainability_evidence_note" text,
  ADD COLUMN IF NOT EXISTS "sustainability_verified_at" timestamp,
  ADD COLUMN IF NOT EXISTS "sustainability_updated_at" timestamp;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_products_origin_country_code') THEN
    ALTER TABLE "products" ADD CONSTRAINT "chk_products_origin_country_code"
      CHECK ("origin_country_code" IS NULL OR "origin_country_code" ~ '^[A-Z]{2}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_products_season_months') THEN
    ALTER TABLE "products" ADD CONSTRAINT "chk_products_season_months"
      CHECK ("season_months" IS NULL OR "season_months" <@ ARRAY[1,2,3,4,5,6,7,8,9,10,11,12]::integer[]);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_products_packaging_type') THEN
    ALTER TABLE "products" ADD CONSTRAINT "chk_products_packaging_type"
      CHECK ("packaging_type" IS NULL OR "packaging_type" IN ('none','returnable','recyclable','compostable','single_use','mixed'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_products_sustainability_source') THEN
    ALTER TABLE "products" ADD CONSTRAINT "chk_products_sustainability_source"
      CHECK ("sustainability_source" IS NULL OR "sustainability_source" IN ('supplier','erp','admin'));
  END IF;
END
$$;