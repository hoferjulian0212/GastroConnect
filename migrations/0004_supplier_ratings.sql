-- Supplier ratings (1-5 stars + optional comment) by restaurant per delivered order
CREATE TABLE IF NOT EXISTS "supplier_ratings" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "order_id" varchar(36) NOT NULL REFERENCES "orders"("id"),
  "restaurant_id" varchar(36) NOT NULL REFERENCES "users"("id"),
  "supplier_id" varchar(36) NOT NULL REFERENCES "users"("id"),
  "stars" integer NOT NULL,
  "comment" text,
  "flagged_at" timestamp,
  "flagged_reason" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "uniq_supplier_ratings_order_id" ON "supplier_ratings" ("order_id");
CREATE INDEX IF NOT EXISTS "idx_supplier_ratings_supplier_id" ON "supplier_ratings" ("supplier_id");
CREATE INDEX IF NOT EXISTS "idx_supplier_ratings_restaurant_id" ON "supplier_ratings" ("restaurant_id");
